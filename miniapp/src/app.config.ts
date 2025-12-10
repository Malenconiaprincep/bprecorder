export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/analysis/index',
    'pages/profile/index',
    'pages/input/index',
    'pages/camera/index',
    'pages/login/index',
    'pages/groups/index',
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
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/icons/wode.png',
        selectedIconPath: 'assets/icons/wode.png'
      }
    ]
  }
})
