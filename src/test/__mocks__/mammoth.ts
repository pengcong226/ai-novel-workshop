/** Mock mammoth module for tests */
export function extractRawText(_input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: Array<{ type: string; message: string }> }> {
  return Promise.resolve({ value: 'mock docx content', messages: [] })
}

export default { extractRawText }
