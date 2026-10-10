/** 将页面选择的本地日期、时间转为 ISO 字符串（按用户本地时区） */
export function localDateTimeToISO(dateStr: string, timeStr: string): string {
  const dateParts = dateStr.split('-').map((x) => parseInt(x, 10))
  const timeParts = timeStr.split(':').map((x) => parseInt(x, 10))
  if (dateParts.length !== 3 || timeParts.length < 2) {
    throw new Error('日期时间格式无效')
  }
  const [y, m, d] = dateParts
  const [hh, mm] = timeParts
  const local = new Date(y, m - 1, d, hh, mm, 0, 0)
  if (Number.isNaN(local.getTime())) {
    throw new Error('日期时间无效')
  }
  return local.toISOString()
}
