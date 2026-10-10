export default definePageConfig({
  navigationBarTitleText: '全部记录',
  navigationBarBackgroundColor: '#e8f4ff',
  navigationBarTextStyle: 'black',
  enablePullDownRefresh: false,
  /** 禁止页面整体滚动，避免出现右侧白色页面级滚动条；列表仅由 scroll-view 滚动 */
  disableScroll: true
})
