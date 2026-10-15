# 词间 · Wordspace

英语词库与听写工作台，支持图片/PDF/Word 识别、中文释义、分批词库、手写听写、网页打字听写及跨词库错词复习。

## 使用

在线入口：**https://irisloop.github.io/wordspace/**

1. 导入材料，校对后命名词库。名称留空时按“词库1、词库2……”递增。
2. 选择词库或错词本，选择手写或打字方式。
3. 手写模式在纸上作答，结束后勾选错误；打字模式输入后按 Enter 可确认，计时结束也会自动提交并清空输入框。
4. 整轮结束后统一显示答案。打字模式自动标记拼写错误与漏答，可调整标记后保存。

在线版使用 IndexedDB 保存当前浏览器的词库。不会上传学习材料、答案或词库到 GitHub；浏览器之间、设备之间不自动同步。在“偏好与备份”中导出/恢复 JSON 可迁移数据。清除网站数据前请备份。旧版本地词库可先在本地版导出，再在在线版恢复。

## 发音

默认直接播放 [有道词典官网](https://dict.youdao.com/) 的单词音频，支持英式、美式选择。来源是官网当前使用的 dictvoice 音频地址，无需应用内 API Key；它不是已购买的商业 API 服务，可用性取决于来源网站与网络。

- 不添加首尾静音；重复朗读间隔为 180 毫秒。
- 预加载后续 3 个词，并复用最近的音频，避免临时串行查询多个音源。
- 通过 HTML 音频原速播放；减速时保持音高，避免变调。
- 启动或缓冲超过 4 秒即暂停并提示；不会自动改用其他音源或给未播出的词判错。
- 系统语音需手动选择。发音结束后才开始用户设置的书写／打字时间。

发音时只向有道发送当前及预加载的英文单词，不发送学习材料、中文释义、答案或错词记录。当前没有接入 Cambridge 录音；核对页保留其官方词条链接，供单独查阅。旧版“真人录音”偏好会自动迁移到有道来源，词库和学习记录保留。

## 开发

运行环境：Node.js 22+。

```sh
npm ci --ignore-scripts
npm start
node --test --test-isolation=none tests/*.test.mjs
node scripts/build-pages.mjs
```

本地服务在 `http://127.0.0.1:43127`，本地版数据文件为 `data/wordspace.json`。Windows 便携副本附带启动脚本与运行时；运行时及个人数据不提交到仓库。

GitHub Pages 从 `main` 分支的 `/docs` 发布。修改 `public` 后运行构建脚本，并同时提交源码和 `docs`。OCR、英汉词典、PDF/Word 解析资源均打包到静态目录，不需要后端 API 密钥。

## 开源资源

- [ECDICT](https://github.com/skywind3000/ECDICT)：英汉词典，使用 `ecdict@0.0.4` 提供的快照制作索引。
- [Tesseract.js](https://github.com/naptha/tesseract.js)：英文 OCR。
- [PDF.js](https://github.com/mozilla/pdf.js)：PDF 文本提取与扫描页渲染。
- [Mammoth](https://github.com/mwilliamson/mammoth.js)：DOCX 文本提取。
- 旧版保留的 Wikimedia Commons 示例音频及其逐条来源许可，不再作为默认听写音源。

第三方许可证保留在 `licenses` 和 `docs/vendor`；有道音频通过原站点在线播放，发音来源在核对页列出。图片识别可能出错，生僻词可能没有释义，导入前请校对。
