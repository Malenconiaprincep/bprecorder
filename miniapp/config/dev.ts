import { type UserConfigExport } from "@tarojs/cli";
import { loadBuildSecrets, toDefineConstants } from "./buildSecrets";

const buildSecrets = loadBuildSecrets();

export default {
  logger: {
    quiet: false,
    stats: true
  },
  mini: {},
  h5: {},
  defineConstants: {
    // 本地开发时使用本地接口
    API_BASE_URL: '"http://localhost:3000"',
    ...toDefineConstants(buildSecrets),
  }
} satisfies UserConfigExport

