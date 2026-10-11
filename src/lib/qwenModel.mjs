export function resolveQwenVlModel(configuredModel) {
  return configuredModel?.trim() || 'qwen3-vl-plus'
}
