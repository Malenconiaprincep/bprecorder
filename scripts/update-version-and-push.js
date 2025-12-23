#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 读取 profile/index.tsx 获取当前版本号
const profilePath = path.join(__dirname, '../miniapp/src/pages/profile/index.tsx');
let profileContent = fs.readFileSync(profilePath, 'utf8');

// 匹配版本号行: v1.8.0
const versionRegex = /v(\d+\.\d+\.\d+)/;
const match = profileContent.match(versionRegex);

if (!match) {
  console.error('❌ 错误: 未找到版本号，请检查 profile/index.tsx');
  process.exit(1);
}

const currentVersion = match[1]; // 1.8.0 (不带 v 前缀)
console.log(`当前版本: v${currentVersion}`);

// 解析版本号 (例如: 1.8.0 -> [1, 8, 0])
const versionParts = currentVersion.split('.').map(Number);
// 递增补丁版本号 (1.8.0 -> 1.8.1)
versionParts[2] = (versionParts[2] || 0) + 1;
const newVersion = versionParts.join('.');

console.log(`新版本: v${newVersion}`);

// 更新 profile/index.tsx 中的版本号
profileContent = profileContent.replace(versionRegex, `v${newVersion}`);
fs.writeFileSync(profilePath, profileContent, 'utf8');
console.log(`✅ 已更新 ${profilePath} 中的版本号为 v${newVersion}`);

// 更新 package.json 版本号（如果存在）
const packageJsonPath = path.join(__dirname, '../package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`✅ 已更新 package.json 中的版本号为 ${newVersion}`);
}

// Git commit 和 push
try {
  console.log('\n执行 git add...');
  execSync('git add .', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  
  console.log(`执行 git commit...`);
  execSync(`git commit -m "chore: bump version to v${newVersion}"`, { 
    stdio: 'inherit', 
    cwd: path.join(__dirname, '..') 
  });
  
  console.log('执行 git push...');
  execSync('git push', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  
  console.log('\n✅ 版本更新、提交和推送完成！');
} catch (error) {
  console.error('\n❌ Git 操作失败:', error.message);
  console.error('请检查:');
  console.error('1. 是否有未提交的更改');
  console.error('2. Git 仓库是否已配置远程地址');
  console.error('3. 是否有推送权限');
  process.exit(1);
}

