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
    let mimeType = ''

    for await (const chunk of response) {
      const parts = chunk?.candidates?.[0]?.content?.parts || []

      for (const part of parts) {
        if (part.inlineData?.data) {
          audioBase64 += part.inlineData.data
          mimeType = part.inlineData.mimeType || mimeType
        }
      }
    }

    if (!audioBase64) {
      return json({ error: '오디오 생성에 실패했어. 잠시 후 다시 시도해줘.' }, 500)
    }

    const normalized = normalizeAudioPayload(audioBase64, mimeType)

    return json({
      script,
      audioBase64: normalized.audioBase64,
      mimeType: normalized.mimeType,
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

function normalizeAudioPayload(audioBase64, mimeType) {
  if (!mimeType) {
    return {
      audioBase64,
      mimeType: 'audio/wav',
    }
  }

  if (mimeType.includes('mpeg')) {
    return { audioBase64, mimeType: 'audio/mpeg' }
  }

  if (mimeType.includes('ogg')) {
    return { audioBase64, mimeType: 'audio/ogg' }
  }

  if (mimeType.includes('wav') || mimeType.includes('wave')) {
    return { audioBase64, mimeType: 'audio/wav' }
  }

  if (mimeType.includes('pcm') || mimeType.includes('L16') || mimeType.includes('audio/raw')) {
    return {
      audioBase64: convertRawToWavBase64(audioBase64, mimeType),
      mimeType: 'audio/wav',
    }
  }

  return {
    audioBase64,
    mimeType,
  }
}

function convertRawToWavBase64(rawBase64, mimeType) {
  const rawBytes = base64ToUint8Array(rawBase64)
  const options = parseMimeType(mimeType)
  const wavHeader = createWavHeader(rawBytes.length, options)
  const combined = new Uint8Array(wavHeader.length + rawBytes.length)
  combined.set(wavHeader, 0)
  combined.set(rawBytes, wavHeader.length)
  return uint8ToBase64(combined)
}

function parseMimeType(mimeType) {
  const [fileType, ...params] = mimeType.split(';').map((s) => s.trim())
  const [, format] = fileType.split('/')

  const options = {
    numChannels: 1,
    sampleRate: 24000,
    bitsPerSample: 16,
  }

  if (format && format.startsWith('L')) {
    const bits = Number.parseInt(format.slice(1), 10)
    if (!Number.isNaN(bits)) {
      options.bitsPerSample = bits
    }
  }

  for (const param of params) {
    const [key, value] = param.split('=').map((s) => s.trim())
    if (key === 'rate') {
      const sampleRate = Number.parseInt(value, 10)
      if (!Number.isNaN(sampleRate)) options.sampleRate = sampleRate
    }
  }

  return options
}

function createWavHeader(dataLength, options) {
  const { numChannels, sampleRate, bitsPerSample } = options
  const byteRate = sampleRate * numChannels * bitsPerSample / 8
  const blockAlign = numChannels * bitsPerSample / 8
  const buffer = new ArrayBuffer(44)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  writeAscii(bytes, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeAscii(bytes, 8, 'WAVE')
  writeAscii(bytes, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(bytes, 36, 'data')
  view.setUint32(40, dataLength, true)

  return bytes
}

function writeAscii(buffer, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    buffer[offset + index] = text.charCodeAt(index)
  }
}

function base64ToUint8Array(base64) {
  const binaryString = atob(base64)
  return Uint8Array.from(binaryString, (char) => char.charCodeAt(0))
}

function uint8ToBase64(uint8Array) {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < uint8Array.length; index += chunkSize) {
    const chunk = uint8Array.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
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
