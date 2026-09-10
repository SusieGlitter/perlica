# 《风起武陵》演示视频

最终成片：`wuling-perlica-demo.mp4`

## 成片规格

- 时长：140.28 秒
- 画面：H.264，1440 x 900，25 fps
- 声音：AAC，48 kHz，双声道
- 旁白母版：`narration.wav`
- 自动验证报告：`build-report.json`
- 抽帧预览：`preview-contact.png`
- 换腿三阶段对照：`support-transfer.jpg`

![左脚支撑、双脚过渡、右脚支撑](support-transfer.jpg)

## 镜头

1. 标题与活动文案。
2. 方兴衢地图、实时小地图和骑行路线。
3. PID 自动巡航与平滑过弯。
4. 自由模式下的 WASD 转向和加速。
5. 制动停车、左脚单脚支撑、双脚着地过渡和右脚接替支撑。
6. 低速倒车与脚部辅助平衡。
7. 46T 牙盘和 18T 飞轮的同步传动。
8. 车架、车筐、活动车牌、碟刹与车铃细节。
9. 程序化道路、城墙、商铺、河道、植被与能源装置。
10. 自动录制和剪辑技术流程。
11. 活动结尾文案。

## 复现流程

需要先启动本地开发服务器：

```powershell
npm run dev
```

如果 Vite 使用 `4173` 端口：

```powershell
$env:WULING_URL = "http://127.0.0.1:4173"
python tools/generate_narration.py enroll
python tools/generate_narration.py synthesize
npm run capture:demo
npm run build:video
```

`capture-demo.mjs` 读取 `narration.json` 和每段旁白时长，按绝对时间推进 11 个镜头。
`build_video.mjs` 生成旁白母版、循环叠加原创配乐、裁切 Playwright WebM，并输出 MP4。

录制脚本默认启用 ANGLE/D3D11 GPU，并拒绝 SwiftShader 软件渲染结果。最终版本使用
Intel Iris Xe 的硬件 WebGL 采集，平均渲染帧率 43.04 fps，p95 帧间隔 50 ms；
去重后源视频仍有 24.17 个有效变化帧/秒。`WULING_GPU_CAPTURE=0` 仅用于排查，
不建议生成正式成片。

## 技术

- Three.js：实时场景、骨骼角色、自行车结构、路线和灯光。
- Playwright：页面自动化、分镜控制、GPU WebM 屏幕录制、帧率监控和截图验证。
- PID 与视线预判：自动巡航循迹。
- 骨骼 IK：腿部踏板约束、停车落脚和换脚。
- QwenTTS：基于公开中文对白片段进行声音特征复刻并合成旁白。
- FFmpeg：裁切、编码、音轨拼接、混音和最终 MP4 封装。

成片中的合成旁白已标注为“AI 声音复刻演示”，不代表官方配音或官方发布内容。
