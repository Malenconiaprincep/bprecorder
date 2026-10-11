/**
 * 分析页刷新标志（全局状态）
 * - 第一次进入分析页时需要拉取数据
 * - 首页有数据操作（新增/编辑/删除）后，下次进入分析页时需要拉取
 * - 其它时间切换到分析页不拉取
 */
let analysisNeedRefresh = true

export function getAnalysisNeedRefresh(): boolean {
  return analysisNeedRefresh
}

export function setAnalysisNeedRefresh(value: boolean): void {
  analysisNeedRefresh = value
}

/** 消费标志：返回当前值并将标志置为 false，用于分析页 useDidShow 判断是否拉取 */
export function consumeAnalysisNeedRefresh(): boolean {
  const need = analysisNeedRefresh
  analysisNeedRefresh = false
  return need
}
