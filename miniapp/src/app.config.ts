export default defineAppConfig({
  permission: {
    'scope.camera': {
      desc: '用于拍摄血压计屏幕进行识别'
    },
    'scope.userLocation': {
      desc: '用于结合您所在地天气生成更准确的生活饮食建议'
    }
  },
  requiredPrivateInfos: ['getLocation'],
  pages: [
    'pages/index/index',
    'pages/analysis/index',
    'pages/groups/index',
    'pages/profile/index',
    'pages/promo-list/index',
    'pages/promo-activity/index',
    'pages/weekly-report/index',
    'pages/input/index',
    'pages/diet-advice/index',
    'pages/camera/index',
    'pages/calendar/index',
    'pages/groups/detail',
    'pages/groups/join',
    'pages/groups/member'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#f0f6ff',
    navigationBarTitleText: '血压记录',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f0f6ff',
    enablePullDownRefresh: false,
    disableScroll: false
  },
  tabBar: {
    color: '#94a3b8',
    selectedColor: '#3b82f6',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/icons/home.png',
        selectedIconPath: 'assets/icons/home.png'
      },
      {
        pagePath: 'pages/analysis/index',
        text: '分析',
        iconPath: 'assets/icons/analyse.png',
        selectedIconPath: 'assets/icons/analyse.png'
      },
      {
        pagePath: 'pages/groups/index',
        text: '组',
        iconPath: 'assets/icons/tab-group.png',
        selectedIconPath: 'assets/icons/tab-group.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/icons/wode.png',
        selectedIconPath: 'assets/icons/wode.png'
      }
    ]
  }
})
