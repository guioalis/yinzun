# 实时音准监控应用

这是一个基于Web Audio API的实时音准监控应用，可以帮助用户检测和改进他们的演唱或演奏音准。

## 功能特点

- 实时音高检测
- 音符和频率显示
- 音准偏差可视化
- 波形图显示
- 准确度评分
- 实时反馈信息

## 技术栈

- 前端：HTML, CSS, JavaScript, Web Audio API
- 后端：Deno

## 本地运行

确保已安装 [Deno](https://deno.land/#installation)，然后执行：

```bash
# 开发模式（支持热重载）
deno task dev

# 或生产模式
deno task start
```

然后在浏览器中访问 http://localhost:8000

## Deno Deploy 一键部署

1. 注册 [Deno Deploy](https://deno.com/deploy) 账号

2. 创建新项目
   - 点击 "New Project"
   - 选择 "Deploy from GitHub"
   - 连接你的 GitHub 账号并选择包含此代码的仓库

3. 配置部署
   - 入口文件设置为 `server.ts`
   - 环境变量可选（默认端口为8000）

4. 点击部署
   - Deno Deploy 会自动部署你的应用
   - 部署完成后，你会获得一个 `*.deno.dev` 的URL

## 使用说明

1. 点击"开始监听"按钮，授权麦克风访问
2. 选择参考音符或使用自动检测模式
3. 演唱或演奏，观察实时反馈
4. 根据反馈调整音高，提高音准准确度

## 注意事项

- 应用需要麦克风权限才能工作
- 建议在安静的环境中使用，以获得更准确的检测结果
- 支持现代浏览器（Chrome, Firefox, Edge等）