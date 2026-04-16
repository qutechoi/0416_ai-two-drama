# 0416_ai-two-drama

Gemini 3.1 Flash TTS를 이용해 두 캐릭터가 실제로 대화하는 짧은 2인극을 생성하는 웹앱입니다.

프론트엔드는 React + Vite, API 키 관리는 Cloudflare Pages Functions를 전제로 구성했습니다.

## Features

- 2인극 프리셋 3종 제공
- 장면, 캐릭터, 연출 톤 자유 입력
- 화자별 Gemini TTS voice 선택
- 스크립트 + 음성 동시 생성
- Gemini API 키는 클라이언트가 아닌 Pages Functions에서 관리

## Stack

- React
- Vite
- Cloudflare Pages Functions
- Gemini 3.1 Flash TTS (`gemini-3.1-flash-tts-preview`)
- `@google/genai`

## Local Development

```bash
npm install
npm run dev
```

## Cloudflare Pages Setup

1. Cloudflare Pages에 이 저장소 연결
2. Build command:
   ```bash
   npm run build
   ```
3. Build output directory:
   ```bash
   dist
   ```
4. Environment Variable 추가:
   - `GEMINI_API_KEY` = your Gemini API key

## Functions

- API endpoint: `/api/generate-drama`
- 위치: `functions/api/generate-drama.js`

## Notes

- 현재 구현은 Gemini 3.1 Flash TTS preview 모델 기준
- 실제 배포 전 Cloudflare Pages Functions 런타임에서 `@google/genai` 동작 여부를 한 번 점검하는 것이 좋음
- 필요하면 후속 작업으로 streaming 재생, 다운로드 버튼, 대본 편집 후 재합성 기능을 붙일 수 있음
