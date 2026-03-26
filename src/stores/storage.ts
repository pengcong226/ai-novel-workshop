import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Chapter } from '@/types'
import { normalizeChapterForProject, normalizeChaptersForProject } from './chapterPersistence'

// 使用IndexedDB存储大数据，LocalStorage存储元数据
const DB_NAME = 'AI_Novel_Workshop'
const DB_VERSION = 2 // 升级数据库版本以支持章节分离存储
const PROJECTS_STORE = 'projects'
const CHAPTERS_STORE = 'chapters'

// 判断是否在 Tauri 环境中运行
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
type ChapterWithProjectId = Chapter & { projectId: string }

class IndexedDBStorage {
  private db: IDBDatabase | null = null

  async init() {
    return new Promise<void>((resolve, reject) => {
      console.log('[IndexedDB] 开始初始化...')
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('[IndexedDB] 初始化失败:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('[IndexedDB] 数据库连接成功')

        // 检查对象存储是否存在
        if (!this.db.objectStoreNames.contains(PROJECTS_STORE)) {
          console.error('[IndexedDB] projects 对象存储不存在，需要重建数据库')
          this.db.close()
          // 删除旧数据库并重建
          indexedDB.deleteDatabase(DB_NAME)
          console.log('[IndexedDB] 已删除旧数据库，正在重新初始化...')

          // 重新打开数据库
          const newRequest = indexedDB.open(DB_NAME, DB_VERSION)
          newRequest.onerror = () => reject(newRequest.error)
          newRequest.onsuccess = () => {
            this.db = newRequest.result
            console.log('[IndexedDB] 数据库重建成功')
            resolve()
          }
          newRequest.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result
            this.createStores(db)
          }
        } else {
          console.log('[IndexedDB] 对象存储检查通过')
          resolve()
        }
      }

      request.onupgradeneeded = (event) => {
        console.log('[IndexedDB] 触发 onupgradeneeded，创建对象存储')
        const db = (event.target as IDBOpenDBRequest).result
        this.createStores(db)
      }
    })
  }

  private createStores(db: IDBDatabase) {
    // 项目存储（不包含章节数据）
    if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
      console.log('[IndexedDB] 创建 projects 对象存储')
      db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
    }

    // 章节存储（独立存储，支持分页加载）
    if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
      console.log('[IndexedDB] 创建 chapters 对象存储')
      const chaptersStore = db.createObjectStore(CHAPTERS_STORE, { keyPath: 'id' })
      chaptersStore.createIndex('projectId', 'projectId', { unique: false })
      chaptersStore.createIndex('number', 'number', { unique: false })
    }
  }

  // 保存项目元数据到LocalStorage
  async saveProjectsList(projects: any[]) {
    const projectsList = projects.map(p => ({
      id: p.id,
      title: p.title,
      genre: p.genre,
      targetWords: p.targetWords,
      currentWords: p.currentWords,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }))

    localStorage.setItem('ai_novel_projects', JSON.stringify(projectsList))
  }

  // 加载项目列表
  async loadProjectsList() {
    const data = localStorage.getItem('ai_novel_projects')
    return data ? JSON.parse(data) : []
  }

  // 保存项目（分离章节存储）
  async saveProject(project: any) {
    if (!this.db) await this.init()

    // 确保数据是普通对象
    const projectData = JSON.parse(JSON.stringify(project))
    const chapters = normalizeChaptersForProject(projectData.chapters || [], projectData.id)

    // 从项目对象中分离章节
    const projectMeta = { ...projectData }
    delete projectMeta.chapters

    const transaction = this.db!.transaction([PROJECTS_STORE, CHAPTERS_STORE], 'readwrite')

    return new Promise<void>((resolve, reject) => {
      // 保存项目元数据
      const projectStore = transaction.objectStore(PROJECTS_STORE)
      projectStore.put(projectMeta)

      // 批量保存章节
      const chaptersStore = transaction.objectStore(CHAPTERS_STORE)
      for (const chapter of chapters) {
        chaptersStore.put(chapter)
      }

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  // 加载项目（分页加载章节）
  async loadProject(projectId: string, options?: { loadChapters?: boolean }) {
    if (!this.db) await this.init()

    console.log('[IndexedDB] 开始加载项目，ID:', projectId)

    return new Promise<any>((resolve, reject) => {
      const transaction = this.db!.transaction([PROJECTS_STORE], 'readonly')
      const store = transaction.objectStore(PROJECTS_STORE)
      const request = store.get(projectId)

      request.onsuccess = async () => {
        const project = request.result
        console.log('[IndexedDB] 项目加载结果:', project ? '找到' : '未找到')

        if (!project) {
          resolve(null)
          return
        }

        // 默认加载所有章节，但支持延迟加载
        if (options?.loadChapters !== false) {
          const chapters = await this.loadChapters(projectId)
          project.chapters = chapters
        } else {
          project.chapters = []
        }

        resolve(project)
      }

      request.onerror = () => {
        console.error('[IndexedDB] 项目加载失败:', request.error)
        reject(request.error)
      }
    })
  }

  // 加载项目的所有章节
  async loadChapters(projectId: string) {
    if (!this.db) await this.init()

    return new Promise<any[]>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE], 'readonly')
      const store = transaction.objectStore(CHAPTERS_STORE)
      const index = store.index('projectId')
      const request = index.getAll(IDBKeyRange.only(projectId))

      request.onsuccess = () => {
        const chapters = request.result || []
        // 按章节号排序
        chapters.sort((a, b) => (a.number || 0) - (b.number || 0))
        resolve(chapters)
      }

      request.onerror = () => reject(request.error)
    })
  }

  // 分页加载章节
  async loadChaptersPaginated(
    projectId: string,
    page: number = 1,
    pageSize: number = 20
  ) {
    if (!this.db) await this.init()

    return new Promise<{ chapters: any[], total: number }>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE], 'readonly')
      const store = transaction.objectStore(CHAPTERS_STORE)
      const index = store.index('projectId')
      const request = index.openCursor(IDBKeyRange.only(projectId))

      const allChapters: any[] = []

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          allChapters.push(cursor.value)
          cursor.continue()
        } else {
          // 排序
          allChapters.sort((a, b) => (a.number || 0) - (b.number || 0))

          // 分页
          const total = allChapters.length
          const start = (page - 1) * pageSize
          const end = start + pageSize
          const chapters = allChapters.slice(start, end)

          resolve({ chapters, total })
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  // 保存单个章节（增量更新）
  async saveChapter(chapter: ChapterWithProjectId) {
    if (!this.db) await this.init()

    if (!chapter?.projectId) {
      throw new Error('章节缺少 projectId，无法保存')
    }

    const chapterData = normalizeChapterForProject(chapter, chapter.projectId)

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE], 'readwrite')
      const store = transaction.objectStore(CHAPTERS_STORE)
      const request = store.put(chapterData)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 删除单个章节
  async deleteChapter(chapterId: string) {
    if (!this.db) await this.init()

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE], 'readwrite')
      const store = transaction.objectStore(CHAPTERS_STORE)
      const request = store.delete(chapterId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // 删除项目
  async deleteProject(projectId: string) {
    if (!this.db) await this.init()

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([PROJECTS_STORE, CHAPTERS_STORE], 'readwrite')

      // 删除项目
      const projectStore = transaction.objectStore(PROJECTS_STORE)
      projectStore.delete(projectId)

      // 删除相关章节
      const chaptersStore = transaction.objectStore(CHAPTERS_STORE)
      const index = chaptersStore.index('projectId')
      const chaptersRequest = index.openCursor(IDBKeyRange.only(projectId))

      chaptersRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }
}

class TauriStorage {
  async init() {
    console.log('[TauriStorage] 初始化...');
  }

  async loadProjectsList() {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      const data: string = await invoke('load_projects_list');
      return JSON.parse(data);
    } catch (e) {
      console.error('[TauriStorage] 加载项目列表失败:', e);
      return [];
    }
  }

  async saveProjectsList(projects: any[]) {
    const { invoke } = await import('@tauri-apps/api/core');
    const projectsList = projects.map(p => ({
      id: p.id,
      title: p.title,
      genre: p.genre,
      targetWords: p.targetWords,
      currentWords: p.currentWords,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));
    try {
      await invoke('save_projects_list', { data: JSON.stringify(projectsList) });
    } catch (e) {
      console.error('[TauriStorage] 保存项目列表失败:', e);
    }
  }

  async loadProject(projectId: string) {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      const data: string = await invoke('load_project', { id: projectId });
      return JSON.parse(data);
    } catch (e) {
      console.error('[TauriStorage] 加载项目失败:', e);
      return null;
    }
  }

  async saveProject(project: any) {
    const { invoke } = await import('@tauri-apps/api/core');

    // 浅拷贝 project 以便分离 chapters
    const projectCopy = { ...project };
    const chapters = normalizeChaptersForProject(projectCopy.chapters || [], project.id);

    // 从主对象中删除 chapters 属性，减轻单条记录大小
    delete projectCopy.chapters;

    try {
      // 批量一次性保存项目和所有章节
      await invoke('save_project_with_chapters', {
        id: project.id,
        projectData: JSON.stringify(projectCopy),
        chaptersData: chapters.map((c: any) => JSON.stringify(c))
      });
    } catch (e) {
      console.error('[TauriStorage] 保存项目失败:', e);
      throw new Error(`桌面端保存项目失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async findProjectContainingChapter(chapterId: string) {
    const projectList = await this.loadProjectsList();

    for (const projectMeta of projectList) {
      const project = await this.loadProject(projectMeta.id);
      if (project?.chapters?.some((chapter: any) => chapter.id === chapterId)) {
        return project;
      }
    }

    return null;
  }

  async saveChapter(chapter: ChapterWithProjectId) {
    const project = await this.findProjectContainingChapter(chapter.id);

    if (!project) {
      throw new Error(`桌面端未找到章节 ${chapter.id} 对应的项目，无法保存章节`);
    }

    const chapters = Array.isArray(project.chapters) ? [...project.chapters] : [];
    const index = chapters.findIndex((item: any) => item.id === chapter.id);

    if (index >= 0) {
      chapters[index] = { ...chapters[index], ...chapter };
    } else {
      chapters.push(chapter);
    }

    await this.saveProject({ ...project, chapters });
  }

  async deleteChapter(chapterId: string) {
    const project = await this.findProjectContainingChapter(chapterId);

    if (!project) {
      throw new Error(`桌面端未找到章节 ${chapterId} 对应的项目，无法删除章节`);
    }

    const chapters = Array.isArray(project.chapters)
      ? project.chapters.filter((chapter: any) => chapter.id !== chapterId)
      : [];

    await this.saveProject({ ...project, chapters });
  }

  async deleteProject(projectId: string) {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('delete_project', { id: projectId });
    } catch (e) {
      console.error('[TauriStorage] 删除项目失败:', e);
      throw new Error(`桌面端删除项目失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export const useStorage = defineStore('storage', () => {
  const storage = isTauri ? new TauriStorage() : new IndexedDBStorage()
  const isInitialized = ref(false)

  async function init() {
    if (!isInitialized.value) {
      await storage.init()
      isInitialized.value = true
    }
  }

  async function loadProjects() {
    await init()
    return await storage.loadProjectsList()
  }

  async function saveProjects(projects: any[]) {
    await init()
    return await storage.saveProjectsList(projects)
  }

  async function loadProject(projectId: string) {
    await init()
    return await storage.loadProject(projectId)
  }

  async function saveProject(project: any) {
    await init()
    return await storage.saveProject(project)
  }

  async function deleteProject(projectId: string) {
    await init()
    return await storage.deleteProject(projectId)
  }

  // 新增：章节级别的操作方法
  async function loadChapters(projectId: string) {
    if (storage instanceof IndexedDBStorage) {
      return await storage.loadChapters(projectId)
    }
    // Tauri 存储已经包含章节在项目对象中
    const project = await loadProject(projectId)
    return project?.chapters || []
  }

  async function loadChaptersPaginated(projectId: string, page: number, pageSize: number) {
    if (storage instanceof IndexedDBStorage) {
      return await storage.loadChaptersPaginated(projectId, page, pageSize)
    }
    // Tauri: 简单返回所有章节并分页
    const chapters = await loadChapters(projectId)
    const total = chapters.length
    const start = (page - 1) * pageSize
    const end = start + pageSize
    return { chapters: chapters.slice(start, end), total }
  }

  async function saveChapter(chapter: ChapterWithProjectId) {
    if (storage instanceof IndexedDBStorage) {
      return await storage.saveChapter(chapter)
    }

    if (storage instanceof TauriStorage) {
      return await storage.saveChapter(chapter)
    }

    throw new Error('当前存储后端不支持章节级保存')
  }

  async function deleteChapter(chapterId: string) {
    if (storage instanceof IndexedDBStorage) {
      return await storage.deleteChapter(chapterId)
    }

    if (storage instanceof TauriStorage) {
      return await storage.deleteChapter(chapterId)
    }

    throw new Error('当前存储后端不支持章节级删除')
  }

  return {
    isInitialized,
    loadProjects,
    saveProjects,
    loadProject,
    saveProject,
    deleteProject,
    loadChapters,
    loadChaptersPaginated,
    saveChapter,
    deleteChapter
  }
})
