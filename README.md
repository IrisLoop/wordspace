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

默认优先使用真人录音。当前内置 13 个常用词的美式录音（含 apple、book、day 等），其他词通过 [Free Dictionary API](https://dictionaryapi.dev/) 获取有来源和许可标记的录音，逐条提供原录音、原作者来源页及许可链接。此录音**不是 Cambridge 官方录音**。

录音完整加载后再播放，首尾添加少量静音，两声道输出相同的声音以避免左右摆动；发音结束后才进入作答倒计时。录音缺失或网络不可用时，界面会明确提示并回退到系统英语语音。系统语音由浏览器/系统播放，网页无法重新处理其声道。

其他词的真人录音查询会向 Dictionary API 发送当前及下一单词，需联网。页面中的“Cambridge 官方试听”链接直接打开该词的官方页面。将 Cambridge 官方录音直接集成到连续播放中需要取得其相应授权，此项目未收录或冒充该音源。

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
- [Free Dictionary API](https://dictionaryapi.dev/) / Wikimedia Commons：带有逐条许可标记的真人录音索引。

第三方许可证保留在 `licenses` 和 `docs/vendor`；真人录音遵守各自的来源许可，播放页说明音量、声道与留白处理。图片识别可能出错，生僻词可能没有释义，导入前请校对。
