export default {
  plugins: {
    autoprefixer: {
      overrideBrowserslist: [
        '> 1%',
        'last 2 versions',
        'not dead',
        'not ie 11',
        'Chrome >= 80',
        'Firefox >= 78',
        'Safari >= 14',
        'Edge >= 80'
      ]
    }
  }
}
