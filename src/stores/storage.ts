import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getLogger } from '@/utils/logger'

const logger = getLogger('storage')

// 使用IndexedDB存储大数据，LocalStorage存储元数据
const DB_NAME = 'AI_Novel_Workshop'
const DB_VERSION = 2 // 升级数据库版本以支持章节分离存储
const PROJECTS_STORE = 'projects'
const CHAPTERS_STORE = 'chapters'

// 判断是否在 Tauri 环境中运行
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

class IndexedDBStorage {
  private db: IDBDatabase | null = null

  async init() {
    return new Promise<void>((resolve, reject) => {
      logger.info('开始初始化...')
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        logger.error('初始化失败:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        logger.info('数据库连接成功')

        // 检查对象存储是否存在
        if (!this.db.objectStoreNames.contains(PROJECTS_STORE)) {
          logger.error('projects 对象存储不存在，需要重建数据库')
          this.db.close()
          // 删除旧数据库并重建
          indexedDB.deleteDatabase(DB_NAME)
          logger.info('已删除旧数据库，正在重新初始化...')

          // 重新打开数据库
          const newRequest = indexedDB.open(DB_NAME, DB_VERSION)
          newRequest.onerror = () => reject(newRequest.error)
          newRequest.onsuccess = () => {
            this.db = newRequest.result
            logger.info('数据库重建成功')
            resolve()
          }
          newRequest.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result
            this.createStores(db)
          }
        } else {
          logger.info('对象存储检查通过')
          resolve()
        }
      }

      request.onupgradeneeded = (event) => {
        logger.info('触发 onupgradeneeded，创建对象存储')
        const db = (event.target as IDBOpenDBRequest).result
        this.createStores(db)
      }
    })
  }

  private createStores(db: IDBDatabase) {
    // 项目存储（不包含章节数据）
    if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
      logger.info('创建 projects 对象存储')
      db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
    }

    // 章节存储（独立存储，支持分页加载）
    if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
      logger.info('创建 chapters 对象存储')
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
    if (!data) return []

    try {
      return JSON.parse(data)
    } catch (error) {
      logger.error('Failed to parse projects list from localStorage:', error)
      return []
    }
  }

  // 保存项目（分离章节存储）
  async saveProject(project: any) {
    if (!this.db) await this.init()

    // 确保数据是普通对象
    let projectData: any
    try {
      projectData = JSON.parse(JSON.stringify(project))
    } catch (error) {
      logger.error('Failed to serialize project data:', error)
      throw new Error('Invalid project data: cannot serialize')
    }

    const chapters = projectData.chapters || []

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

    logger.info('开始加载项目，ID:', projectId)

    return new Promise<unknown>((resolve, reject) => {
      const transaction = this.db!.transaction([PROJECTS_STORE], 'readonly')
      const store = transaction.objectStore(PROJECTS_STORE)
      const request = store.get(projectId)

      request.onsuccess = async () => {
        const project = request.result
        logger.info('项目加载结果:', project ? '找到' : '未找到')

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
        logger.error('项目加载失败:', request.error)
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
  async saveChapter(chapter: any) {
    if (!this.db) await this.init()

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE], 'readwrite')
      const store = transaction.objectStore(CHAPTERS_STORE)
      const request = store.put(chapter)

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
    logger.info('初始化...');
  }

  async loadProjectsList() {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      const data: string = await invoke('load_projects_list');
      return JSON.parse(data);
    } catch (e) {
      logger.error('加载项目列表失败:', e);
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
      logger.error('保存项目列表失败:', e);
    }
  }

  async loadProject(projectId: string) {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      // 1. 获取项目骨架（不包含全量章节）
      const skeletonData: string = await invoke('load_project_skeleton', { id: projectId });
      const project = JSON.parse(skeletonData);

      // 2. 获取章节元数据（剥离了重型 content 字段）
      const chaptersMeta: string = await invoke('load_chapters_metadata', { projectId });
      project.chapters = JSON.parse(chaptersMeta);
      
      // 按章节号排序保障时序
      if (Array.isArray(project.chapters)) {
        project.chapters.sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
      }

      return project;
    } catch (e) {
      logger.error('加载项目失败:', e);
      return null;
    }
  }

  async loadChapter(projectId: string, chapterId: string) {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      const data: string = await invoke('load_chapter', { projectId, chapterId });
      return JSON.parse(data);
    } catch (e) {
      logger.error(`加载章节 ${chapterId} 失败:`, e);
      return null;
    }
  }

  async saveProject(project: any) {
    const { invoke } = await import('@tauri-apps/api/core');
    const projectCopy = { ...project };
    const chapters = projectCopy.chapters || [];
    const characters = projectCopy.characters || [];
    const worldbook = projectCopy.worldbook?.entries || [];

    delete projectCopy.chapters;
    delete projectCopy.characters;
    if (projectCopy.worldbook) {
      delete projectCopy.worldbook.entries;
    }

    try {
      // 探针机制：新项目导入时包含完整的内容（content），此时我们使用全局替换保存。
      // 日常编辑器触发的存盘，因为在 project.ts 中 content 已经被前端状态层剥离，因此只保存骨架以防数据覆盖丢失。
      const isFullPackage = chapters.length > 0 && chapters[0].content !== undefined;

      if (isFullPackage) {
        await invoke('save_project_with_chapters', {
          id: project.id,
          projectData: JSON.stringify(projectCopy),
          chaptersData: chapters.map((c: any) => JSON.stringify(c)),
          charactersData: characters.map((c: any) => JSON.stringify(c)),
          worldbookData: worldbook.map((w: any) => JSON.stringify(w))
        });
      } else {
        await invoke('save_project', {
          id: project.id,
          data: JSON.stringify(projectCopy),
          characters: characters.map((c: any) => JSON.stringify(c)),
          worldbook: worldbook.map((w: any) => JSON.stringify(w))
        });
      }
    } catch (e: any) {
      logger.error('保存项目完整包失败:', e);
      throw new Error(`桌面端保存项目失败：${e.message || String(e)}`);
    }
  }

  async saveChapter(chapter: any, projectId?: string) {
    const { invoke } = await import('@tauri-apps/api/core');
    if (!projectId) {
      throw new Error("缺少 projectId，无法直接保存对应章节");
    }
    try {
      await invoke('save_chapter', {
        projectId: projectId,
        chapterId: chapter.id,
        data: JSON.stringify(chapter)
      });
    } catch (e) {
      logger.error('保存章节报错:', e);
      throw e;
    }
  }

  async deleteChapter(chapterId: string, projectId?: string) {
    // Note: If projectId isn't explicitly passed, we would need to look it up, 
    // but going forward we will ensure it's provided.
    if (!projectId) {
         throw new Error("删除章节必须提供 projectId");
    }
    const { invoke } = await import('@tauri-apps/api/core');
    // We don't have a specific `delete_chapter` implemented in rust yet, so we have to use the full delete logic.
    // Wait, let's invoke a delete_chapter if it exists or we can just ignore it for now as delete_project handles all.
    // Note: Actually we need a 'delete_chapter' in lib.rs. I'll add that backend invocation next.
    try {
      await invoke('delete_single_chapter', { projectId, chapterId });
    } catch (e) {
      logger.error('删除章节失败:', e);
      throw new Error(`桌面端删除章节失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async deleteProject(projectId: string) {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('delete_project', { id: projectId });
    } catch (e) {
      logger.error('删除项目失败:', e);
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

  async function loadChapter(projectId: string, chapterId: string) {
    await init()
    if (storage instanceof TauriStorage) {
      return await storage.loadChapter(projectId, chapterId)
    }
    // TODO: support IndexedDB implementation if needed
    throw new Error('当前存储后端不支持单个章节内容按需拉取')
  }

  async function saveChapter(chapter: any, projectId?: string) {
    if (storage instanceof IndexedDBStorage) {
      return await storage.saveChapter(chapter)
    }

    if (storage instanceof TauriStorage) {
      return await storage.saveChapter(chapter, projectId)
    }

    throw new Error('当前存储后端不支持章节级保存')
  }

  async function deleteChapter(chapterId: string, projectId?: string) {
    if (storage instanceof IndexedDBStorage) {
      return await storage.deleteChapter(chapterId)
    }

    if (storage instanceof TauriStorage) {
      return await storage.deleteChapter(chapterId, projectId)
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
    loadChapter,
    loadChaptersPaginated,
    saveChapter,
    deleteChapter
  }
})
