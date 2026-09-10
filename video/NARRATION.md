# 《风起武陵》旁白说明

旁白使用 `tools/generate_narration.py` 调用阿里云百炼 QwenTTS 生成，目标模型为
`qwen3-tts-vc-2026-01-22`。

音色参考来自公开视频《佩丽卡 Perlica 干员语音（中） CV：陈婷婷【终末地】》中
10.80 秒至 31.90 秒的连续中文对白。参考片段仅用于本地声音特征复刻，不随仓库或
最终视频分发。网页角色模型、场景、音乐和文案均为本项目的非官方技术演示。

- 参考视频：https://www.bilibili.com/video/BV1sJfSBfEjD
- 角色资料：https://endfield.wiki.gg/wiki/Perlica

合成结果位于 `video/audio/`，旁白稿位于 `video/narration.json`。最终视频中会明确
标注“AI 声音复刻演示”，避免将合成结果误认为官方配音。
