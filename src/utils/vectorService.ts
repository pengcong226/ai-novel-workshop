/**
 * @deprecated 请使用 @/services/vector-service
 * 此文件保留为兼容层，内部重定向到 services/vector-service
 */
export {
  getVectorService,
  createVectorService,
  resetVectorService as clearVectorServiceCache,
  indexExternalArtifacts,
  type VectorService
} from '@/services/vector-service'
