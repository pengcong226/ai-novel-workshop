import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getLogger } from '@/utils/logger'
import { isWebRuntime } from '@/utils/anthropic-guard'
import type { ChapterSnapshot } from '@/types/chapter-version'

const logger = getLogger('storage')

// 使用IndexedDB存储大数据，LocalStorage存储元数据
const DB_NAME = 'AI_Novel_Workshop'
const DB_VERSION = 3 // 升级数据库版本以支持章节快照存储
const PROJECTS_STORE = 'projects'
const CHAPTERS_STORE = 'chapters'
const CHAPTER_SNAPSHOTS_STORE = 'chapter-snapshots'

const isTauri = !isWebRuntime();
const MAX_ID_LENGTH = 256
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024
const MAX_SNAPSHOTS_TO_KEEP = 1_000

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
}

function assertValidChapterSnapshot(snapshot: ChapterSnapshot): void {
  if (!isValidId(snapshot.id) || !isValidId(snapshot.projectId) || !isValidId(snapshot.chapterId)) {
    throw new Error('章节快照标识无效')
  }
  if (typeof snapshot.title !== 'string' || typeof snapshot.content !== 'string') {
    throw new Error('章节快照内容无效')
  }
  if (!Number.isFinite(snapshot.wordCount) || snapshot.wordCount < 0) {
    throw new Error('章节快照字数无效')
  }
  if (!Number.isFinite(snapshot.createdAt)) {
    throw new Error('章节快照时间无效')
  }
  if (snapshot.source !== 'auto' && snapshot.source !== 'manual') {
    throw new Error('章节快照来源无效')
  }
  if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_BYTES) {
    throw new Error('章节快照过大')
  }
}

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
        const missingRequiredStore = [PROJECTS_STORE, CHAPTERS_STORE, CHAPTER_SNAPSHOTS_STORE]
          .some(storeName => !this.db!.objectStoreNames.contains(storeName))
        if (missingRequiredStore) {
          logger.error('IndexedDB 对象存储不完整，需要重建数据库')
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
    // 章节快照存储
    if (!db.objectStoreNames.contains(CHAPTER_SNAPSHOTS_STORE)) {
      logger.info('创建 chapter-snapshots 对象存储')
      const snapshotsStore = db.createObjectStore(CHAPTER_SNAPSHOTS_STORE, { keyPath: 'id' })
      snapshotsStore.createIndex('chapterId', 'chapterId', { unique: false })
      snapshotsStore.createIndex('projectId', 'projectId', { unique: false })
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
      const writeNextChapter = (index: number) => {
        if (index >= chapters.length) return

        const chapter = { ...chapters[index], projectId: projectData.id }
        const getRequest = chaptersStore.get(chapter.id)
        getRequest.onsuccess = () => {
          const existingChapter = getRequest.result
          if (existingChapter && existingChapter.projectId !== projectData.id) {
            transaction.abort()
            return
          }
          chaptersStore.put(chapter)
          writeNextChapter(index + 1)
        }
        getRequest.onerror = () => reject(getRequest.error)
      }
      writeNextChapter(0)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error || new Error('章节 ID 已被其他项目使用'))
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

  async reorderChapters(projectId: string, orderedIds: string[]) {
    if (!this.db) await this.init()

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE], 'readwrite')
      const store = transaction.objectStore(CHAPTERS_STORE)
      const index = store.index('projectId')
      const request = index.getAll(IDBKeyRange.only(projectId))

      request.onsuccess = () => {
        const chapters = request.result || []
        const chapterById = new Map(chapters.map(chapter => [chapter.id, chapter]))
        if (chapterById.size !== chapters.length || orderedIds.length !== chapters.length) {
          transaction.abort()
          reject(new Error('章节排序数据不完整'))
          return
        }

        const seenIds = new Set<string>()
        for (const [index, chapterId] of orderedIds.entries()) {
          const chapter = chapterById.get(chapterId)
          if (!chapter || seenIds.has(chapterId)) {
            transaction.abort()
            reject(new Error('章节排序数据不完整'))
            return
          }
          seenIds.add(chapterId)
          store.put({ ...chapter, number: index + 1 })
        }
      }

      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => {
        if (transaction.error) reject(transaction.error)
      }
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
    if (!isValidId(chapter?.id) || !isValidId(chapter?.projectId)) {
      throw new Error('章节标识无效')
    }

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE], 'readwrite')
      const store = transaction.objectStore(CHAPTERS_STORE)
      const getRequest = store.get(chapter.id)

      getRequest.onsuccess = () => {
        const existingChapter = getRequest.result
        if (existingChapter && existingChapter.projectId !== chapter.projectId) {
          transaction.abort()
          return
        }
        const chapterToSave = existingChapter?.number
          ? { ...chapter, projectId: chapter.projectId, number: existingChapter.number }
          : { ...chapter, projectId: chapter.projectId }
        store.put(chapterToSave)
      }
      getRequest.onerror = () => reject(getRequest.error)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error || new Error('章节保存已取消'))
    })
  }

  // 删除单个章节
  async deleteChapter(chapterId: string, projectId: string) {
    if (!this.db) await this.init()

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE, CHAPTER_SNAPSHOTS_STORE], 'readwrite')
      const chaptersStore = transaction.objectStore(CHAPTERS_STORE)
      const snapshotsStore = transaction.objectStore(CHAPTER_SNAPSHOTS_STORE)
      const chapterRequest = chaptersStore.get(chapterId)

      chapterRequest.onsuccess = () => {
        const chapter = chapterRequest.result
        if (!chapter || chapter.projectId !== projectId) {
          transaction.abort()
          return
        }

        chaptersStore.delete(chapterId)

        const index = snapshotsStore.index('chapterId')
        const snapshotsRequest = index.openCursor(IDBKeyRange.only(chapterId))
        snapshotsRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result
          if (cursor) {
            const snapshot = cursor.value as ChapterSnapshot
            if (snapshot.projectId === projectId) {
              cursor.delete()
            }
            cursor.continue()
          }
        }
        snapshotsRequest.onerror = () => reject(snapshotsRequest.error)
      }
      chapterRequest.onerror = () => reject(chapterRequest.error)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error || new Error('章节不存在或不属于当前项目'))
    })
  }

  async saveChapterSnapshot(snapshot: ChapterSnapshot) {
    assertValidChapterSnapshot(snapshot)
    if (!this.db) await this.init()

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE, CHAPTER_SNAPSHOTS_STORE], 'readwrite')
      const chaptersStore = transaction.objectStore(CHAPTERS_STORE)
      const snapshotsStore = transaction.objectStore(CHAPTER_SNAPSHOTS_STORE)
      const snapshotRequest = snapshotsStore.get(snapshot.id)

      snapshotRequest.onsuccess = () => {
        const existingSnapshot = snapshotRequest.result as ChapterSnapshot | undefined
        if (existingSnapshot && (existingSnapshot.projectId !== snapshot.projectId || existingSnapshot.chapterId !== snapshot.chapterId)) {
          transaction.abort()
          return
        }

        const chapterRequest = chaptersStore.get(snapshot.chapterId)
        chapterRequest.onsuccess = () => {
          const chapter = chapterRequest.result
          if (!chapter || chapter.projectId !== snapshot.projectId) {
            transaction.abort()
            return
          }
          snapshotsStore.put(snapshot)
        }
        chapterRequest.onerror = () => reject(chapterRequest.error)
      }
      snapshotRequest.onerror = () => reject(snapshotRequest.error)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error || new Error('章节不存在或不属于当前项目'))
    })
  }

  async listChapterSnapshots(chapterId: string, projectId: string) {
    if (!this.db) await this.init()

    return new Promise<ChapterSnapshot[]>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTER_SNAPSHOTS_STORE], 'readonly')
      const store = transaction.objectStore(CHAPTER_SNAPSHOTS_STORE)
      const index = store.index('chapterId')
      const request = index.getAll(IDBKeyRange.only(chapterId))

      request.onsuccess = () => resolve((request.result || []).filter(snapshot => snapshot.projectId === projectId))
      request.onerror = () => reject(request.error)
    })
  }

  async getChapterSnapshot(id: string, projectId: string, chapterId: string) {
    if (!this.db) await this.init()

    return new Promise<ChapterSnapshot | undefined>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTER_SNAPSHOTS_STORE], 'readonly')
      const store = transaction.objectStore(CHAPTER_SNAPSHOTS_STORE)
      const request = store.get(id)

      request.onsuccess = () => {
        const snapshot = request.result as ChapterSnapshot | undefined
        if (!snapshot || snapshot.projectId !== projectId || snapshot.chapterId !== chapterId) {
          resolve(undefined)
          return
        }
        resolve(snapshot)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async deleteChapterSnapshot(id: string, projectId: string, chapterId: string) {
    if (!this.db) await this.init()

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTER_SNAPSHOTS_STORE], 'readwrite')
      const store = transaction.objectStore(CHAPTER_SNAPSHOTS_STORE)
      const getRequest = store.get(id)

      getRequest.onsuccess = () => {
        const snapshot = getRequest.result as ChapterSnapshot | undefined
        if (!snapshot || snapshot.projectId !== projectId || snapshot.chapterId !== chapterId) {
          return
        }
        store.delete(id)
      }
      getRequest.onerror = () => reject(getRequest.error)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error || new Error('章节快照删除已取消'))
    })
  }

  async pruneChapterSnapshots(chapterId: string, projectId: string, keepCount: number) {
    if (!Number.isInteger(keepCount) || keepCount < 0 || keepCount > MAX_SNAPSHOTS_TO_KEEP) {
      throw new Error('章节快照保留数量无效')
    }

    const snapshots = await this.listChapterSnapshots(chapterId, projectId)
    const sorted = snapshots.sort((a, b) => b.createdAt - a.createdAt)
    const toDelete = sorted.slice(keepCount)
    if (toDelete.length === 0) return 0

    if (!this.db) await this.init()
    return new Promise<number>((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTER_SNAPSHOTS_STORE], 'readwrite')
      const store = transaction.objectStore(CHAPTER_SNAPSHOTS_STORE)
      for (const snapshot of toDelete) {
        store.delete(snapshot.id)
      }

      transaction.oncomplete = () => resolve(toDelete.length)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error || new Error('章节快照清理已取消'))
    })
  }

  // 删除项目
  async deleteProject(projectId: string) {
    if (!this.db) await this.init()

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([PROJECTS_STORE, CHAPTERS_STORE, CHAPTER_SNAPSHOTS_STORE], 'readwrite')

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

      // 删除相关章节快照
      const snapshotsStore = transaction.objectStore(CHAPTER_SNAPSHOTS_STORE)
      const snapshotsIndex = snapshotsStore.index('projectId')
      const snapshotsRequest = snapshotsIndex.openCursor(IDBKeyRange.only(projectId))

      snapshotsRequest.onsuccess = (event) => {
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

  async reorderChapters(projectId: string, orderedIds: string[]) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('reorder_chapters', { projectId, orderedIds })
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

  async saveChapterSnapshot(snapshot: ChapterSnapshot) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('save_chapter_snapshot', {
      snapshotId: snapshot.id,
      projectId: snapshot.projectId,
      chapterId: snapshot.chapterId,
      data: JSON.stringify(snapshot),
      createdAt: snapshot.createdAt,
    })
  }

  async listChapterSnapshots(chapterId: string, projectId: string) {
    const { invoke } = await import('@tauri-apps/api/core')
    const data: string = await invoke('list_chapter_snapshots', { chapterId, projectId })
    try {
      return JSON.parse(data) as ChapterSnapshot[]
    } catch (error) {
      throw new Error(`章节快照列表解析失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async getChapterSnapshot(id: string, projectId: string, chapterId: string) {
    const { invoke } = await import('@tauri-apps/api/core')
    const data: string | null = await invoke('get_chapter_snapshot', { snapshotId: id, projectId, chapterId })
    if (!data) return undefined
    try {
      return JSON.parse(data) as ChapterSnapshot
    } catch (error) {
      throw new Error(`章节快照解析失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async deleteChapterSnapshot(id: string, projectId: string, chapterId: string) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('delete_chapter_snapshot', { snapshotId: id, projectId, chapterId })
  }

  async pruneChapterSnapshots(chapterId: string, projectId: string, keepCount: number) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<number>('prune_chapter_snapshots', { chapterId, projectId, keepCount })
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

  async function loadFullProject(projectId: string) {
    await init()
    if (storage instanceof TauriStorage) {
      const project = await storage.loadProject(projectId)
      if (!project) return null

      const chapters = await Promise.all(
        (project.chapters || []).map(async (chapter: any) => {
          const fullChapter = await storage.loadChapter(projectId, chapter.id)
          return fullChapter || chapter
        })
      )

      return { ...project, chapters }
    }

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
    await init()
    if (storage instanceof IndexedDBStorage) {
      if (!projectId) throw new Error('保存章节需要 projectId')
      return await storage.saveChapter({ ...chapter, projectId })
    }

    if (storage instanceof TauriStorage) {
      return await storage.saveChapter(chapter, projectId)
    }

    throw new Error('当前存储后端不支持章节级保存')
  }

  async function reorderChapters(projectId: string, orderedIds: string[]) {
    await init()
    return await storage.reorderChapters(projectId, orderedIds)
  }

  async function deleteChapter(chapterId: string, projectId?: string) {
    if (storage instanceof IndexedDBStorage) {
      if (!projectId) throw new Error('删除章节需要 projectId')
      return await storage.deleteChapter(chapterId, projectId)
    }

    if (storage instanceof TauriStorage) {
      return await storage.deleteChapter(chapterId, projectId)
    }

    throw new Error('当前存储后端不支持章节级删除')
  }

  async function saveChapterSnapshot(snapshot: ChapterSnapshot) {
    await init()
    return await storage.saveChapterSnapshot(snapshot)
  }

  async function listChapterSnapshots(chapterId: string, projectId: string) {
    await init()
    return await storage.listChapterSnapshots(chapterId, projectId)
  }

  async function getChapterSnapshot(id: string, projectId: string, chapterId: string) {
    await init()
    return await storage.getChapterSnapshot(id, projectId, chapterId)
  }

  async function deleteChapterSnapshot(id: string, projectId: string, chapterId: string) {
    await init()
    return await storage.deleteChapterSnapshot(id, projectId, chapterId)
  }

  async function pruneChapterSnapshots(chapterId: string, projectId: string, keepCount: number) {
    await init()
    return await storage.pruneChapterSnapshots(chapterId, projectId, keepCount)
  }

  return {
    isInitialized,
    loadProjects,
    saveProjects,
    loadProject,
    loadFullProject,
    saveProject,
    deleteProject,
    loadChapters,
    loadChapter,
    loadChaptersPaginated,
    saveChapter,
    reorderChapters,
    deleteChapter,
    saveChapterSnapshot,
    listChapterSnapshots,
    getChapterSnapshot,
    deleteChapterSnapshot,
    pruneChapterSnapshots
  }
})
