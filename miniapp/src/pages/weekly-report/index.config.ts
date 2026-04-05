export default definePageConfig({
  navigationBarTitleText: '本周总结',
  navigationBarBackgroundColor: '#e0f2fe',
  navigationBarTextStyle: 'black',
  enablePullDownRefresh: false,
  /** 仅由内部 ScrollView 滚动，避免与页面滚动抢高度导致真机空白 */
  disableScroll: true,
  enableShareAppMessage: true,
  enableShareTimeline: true
})
