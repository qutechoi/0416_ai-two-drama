import { GoogleGenAI } from '@google/genai'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  })
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json()
    const {
      title,
      scene,
      speaker1,
      speaker2,
      speaker1Voice,
      speaker2Voice,
      direction,
      prompt,
    } = body

    if (!context.env.GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY가 설정되지 않았어.' }, 500)
    }

    const ai = new GoogleGenAI({ apiKey: context.env.GEMINI_API_KEY })

    const scriptPrompt = `## Title\n${title}\n\n## Scene\n${scene}\n\n## Direction\n${direction}\n\n## Request\n${prompt}\n\nWrite a short Korean two-speaker drama.
Requirements:
- Exactly 8 to 10 lines total
- Alternate speakers naturally
- Use this exact speaker format per line: ${speaker1}: ... / ${speaker2}: ...
- No narration outside dialogue
- Keep each line short enough to sound natural in speech`

    const scriptResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: scriptPrompt,
      config: {
        temperature: 0.9,
      },
    })

    const script = (scriptResponse.text || '').trim()

    if (!script) {
      return json({ error: '대본 생성에 실패했어. 다시 시도해줘.' }, 500)
    }

    const audioPrompt = `## Scene\n${scene}\n\n## Direction\n${direction}\n\n## Dialogue\n${script}`

    const response = await ai.models.generateContentStream({
      model: 'gemini-3.1-flash-tts-preview',
      config: {
        temperature: 1,
        responseModalities: ['audio'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: speaker1,
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: speaker1Voice,
                  },
                },
              },
              {
                speaker: speaker2,
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: speaker2Voice,
                  },
                },
              },
            ],
          },
        },
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: audioPrompt,
            },
          ],
        },
      ],
    })

    let audioBase64 = ''
    let mimeType = 'audio/wav'

    for await (const chunk of response) {
      const parts = chunk?.candidates?.[0]?.content?.parts || []

      for (const part of parts) {
        if (part.inlineData?.data) {
          audioBase64 += part.inlineData.data
          mimeType = normalizeMimeType(part.inlineData.mimeType || mimeType)
        }
      }
    }

    if (!audioBase64) {
      return json({ error: '오디오 생성에 실패했어. 잠시 후 다시 시도해줘.' }, 500)
    }

    return json({
      script,
      audioBase64,
      mimeType,
    })
  } catch (error) {
    return json(
      {
        error: error?.message || '알 수 없는 오류가 발생했어.',
      },
      500,
    )
  }
}

function normalizeMimeType(mimeType) {
  if (!mimeType) return 'audio/wav'
  if (mimeType.includes('wav') || mimeType.includes('wave')) return 'audio/wav'
  if (mimeType.includes('mpeg')) return 'audio/mpeg'
  if (mimeType.includes('ogg')) return 'audio/ogg'
  if (mimeType.includes('pcm') || mimeType.includes('L16')) return 'audio/wav'
  return mimeType
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  })
}
