# 接单决策助手：苹果设备使用与部署

## 最推荐：Netlify Drop

1. 打开 https://app.netlify.com/drop
2. 把 `ride-decision-deploy.zip` 拖进去
3. 等它生成一个 `https://...netlify.app` 链接
4. 在 iPhone / iPad 上用 Safari 打开这个链接
5. 点 Safari 分享按钮
6. 选择“添加到主屏幕”

以后就可以像 App 一样从主屏幕打开。

## 也可以用 GitHub Pages

1. 新建一个 GitHub repo
2. 上传 `ride-decision-deploy` 文件夹里的所有文件
3. 进入 repo 的 Settings > Pages
4. Source 选择 `Deploy from a branch`
5. Branch 选择 `main`，目录选择 `/root`
6. 保存后等待 GitHub 生成网址

## 也可以用 Vercel

1. 新建 Vercel 项目
2. 导入包含这些静态文件的 GitHub repo
3. Framework Preset 选择 `Other`
4. Build Command 留空
5. Output Directory 留空或设为 `.`

## iPhone 注意事项

- 必须用 Safari 打开网页，才能“添加到主屏幕”。
- 部署后的网址需要是 HTTPS，Netlify/Vercel/GitHub Pages 默认都支持。
- 数据目前保存在浏览器本地。如果删除网站数据、换设备或换浏览器，记录不会自动同步。
- 下一步如果要多设备同步，需要加登录和云端数据库。
