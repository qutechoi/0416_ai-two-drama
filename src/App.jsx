import { useMemo, useRef, useState } from 'react'
import './App.css'

const presets = [
  {
    id: 'angel-devil',
    title: '천사 vs 악마',
    scene: '늦은 밤, 마음속 회의실. 중요한 결정을 앞두고 두 목소리가 맞붙는다.',
    speaker1: '천사',
    speaker2: '악마',
    vibe: '유혹적이지만 위트 있게, 감정은 선명하게.',
    seed: '오늘 해야 할 일을 미루고 싶은데, 정말 쉬어도 되는지 두 목소리가 토론해줘.',
  },
  {
    id: 'future-present',
    title: '미래의 나 vs 현재의 나',
    scene: '조용한 새벽 방 안. 5년 뒤의 내가 지금의 나에게 말을 건다.',
    speaker1: '미래의 나',
    speaker2: '현재의 나',
    vibe: '따뜻하고 선명하게, 약간 울컥하게.',
    seed: '지금 이 선택이 맞는지 흔들리는 순간, 미래의 나와 현재의 내가 짧게 대화해줘.',
  },
  {
    id: 'captain-ai',
    title: '우주선 함장 vs AI',
    scene: '고요한 심우주. 미지의 신호를 들은 뒤, 함장과 항법 AI가 판단을 내린다.',
    speaker1: '함장',
    speaker2: '항법 AI',
    vibe: '차분하지만 긴장감 있게, SF 영화 예고편처럼.',
    seed: '정체불명의 신호를 따라갈지 말지, 함장과 AI가 짧고 임팩트 있게 논쟁해줘.',
  },
]

const voiceOptions = [
  'Aoede',
  'Puck',
  'Kore',
  'Callirrhoe',
  'Fenrir',
  'Leda',
  'Orus',
  'Umbriel',
]

function App() {
  const audioRef = useRef(null)
  const previewAudioRef = useRef(null)
  const [presetId, setPresetId] = useState(presets[0].id)
  const selectedPreset = useMemo(() => presets.find((preset) => preset.id === presetId) || presets[0], [presetId])

  const [form, setForm] = useState({
    title: selectedPreset.title,
    scene: selectedPreset.scene,
    speaker1: selectedPreset.speaker1,
    speaker2: selectedPreset.speaker2,
    speaker1Voice: 'Aoede',
    speaker2Voice: 'Puck',
    direction: selectedPreset.vibe,
    prompt: selectedPreset.seed,
  })

  const [status, setStatus] = useState('아직 장면을 생성하지 않았어.')
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState('')
  const [script, setScript] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [audioMimeType, setAudioMimeType] = useState('audio/wav')
  const [previewAudioUrl, setPreviewAudioUrl] = useState('')
  const [error, setError] = useState('')

  const applyPreset = (preset) => {
    setPresetId(preset.id)
    setForm((prev) => ({
      ...prev,
      title: preset.title,
      scene: preset.scene,
      speaker1: preset.speaker1,
      speaker2: preset.speaker2,
      direction: preset.vibe,
      prompt: preset.seed,
    }))
    setStatus(`'${preset.title}' 프리셋을 불러왔어.`)
  }

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const decodeAudioToBlobUrl = (audioBase64, mimeType = 'audio/wav') => {
    const binary = Uint8Array.from(atob(audioBase64), (char) => char.charCodeAt(0))
    const blob = new Blob([binary], { type: mimeType })
    return URL.createObjectURL(blob)
  }

  const handlePreview = async (speakerKey) => {
    const isSpeakerOne = speakerKey === 'speaker1'
    const speakerName = isSpeakerOne ? form.speaker1 : form.speaker2
    const voiceName = isSpeakerOne ? form.speaker1Voice : form.speaker2Voice

    setPreviewLoading(speakerKey)
    setError('')

    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl)
      setPreviewAudioUrl('')
    }

    try {
      const response = await fetch('/api/generate-drama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'preview',
          speakerName,
          voiceName,
          text: `${speakerName || '화자'}입니다. 안녕하세요.`,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '음색 미리듣기에 실패했어.')
      }

      const url = decodeAudioToBlobUrl(data.audioBase64, data.mimeType || 'audio/wav')
      setPreviewAudioUrl(url)

      window.setTimeout(() => {
        if (previewAudioRef.current) {
          previewAudioRef.current.src = url
          previewAudioRef.current.play().catch(() => {})
        }
      }, 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setPreviewLoading('')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setStatus('두 인물의 대사를 만들고 음성을 합성하는 중이야...')

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl('')
      setAudioMimeType('audio/wav')
    }

    try {
      const response = await fetch('/api/generate-drama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '장면 생성에 실패했어.')
      }

      setScript(data.script)

      if (!data.audioBase64) {
        throw new Error('오디오 데이터가 비어 있어.')
      }

      const resolvedMimeType = data.mimeType || 'audio/wav'
      const url = decodeAudioToBlobUrl(data.audioBase64, resolvedMimeType)

      setAudioMimeType(resolvedMimeType)
      setAudioUrl(url)
      setStatus('완성됐어. 바로 들어보거나 저장해봐.')

      window.setTimeout(() => {
        audioRef.current?.load()
      }, 0)
    } catch (err) {
      setError(err.message)
      setStatus('생성 중 문제가 생겼어.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">0416 AI Two Drama</span>
          <h1>AI 2인극 생성기</h1>
          <p>
            장면, 캐릭터, 말투를 정하면 Gemini 3.1 Flash TTS로 두 인물이 실제로 대화하는 짧은 극을
            만들어주는 웹앱이야.
          </p>
        </div>

        <div className="status-card">
          <span className="status-label">Status</span>
          <strong>{loading ? '생성 중...' : '준비 완료'}</strong>
          <p>{status}</p>
          {error && <small>{error}</small>}
        </div>
      </section>

      <section className="preset-strip">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={preset.id === presetId ? 'preset-button active' : 'preset-button'}
            onClick={() => applyPreset(preset)}
          >
            <strong>{preset.title}</strong>
            <span>{preset.scene}</span>
          </button>
        ))}
      </section>

      <section className="app-grid">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <div className="field-grid two-up">
            <label>
              <span>극 제목</span>
              <input value={form.title} onChange={(event) => handleChange('title', event.target.value)} />
            </label>
            <label>
              <span>연출 톤</span>
              <input value={form.direction} onChange={(event) => handleChange('direction', event.target.value)} />
            </label>
          </div>

          <label>
            <span>장면</span>
            <textarea rows="4" value={form.scene} onChange={(event) => handleChange('scene', event.target.value)} />
          </label>

          <div className="field-grid two-up">
            <label>
              <span>화자 1 이름</span>
              <input value={form.speaker1} onChange={(event) => handleChange('speaker1', event.target.value)} />
            </label>
            <label>
              <span>화자 2 이름</span>
              <input value={form.speaker2} onChange={(event) => handleChange('speaker2', event.target.value)} />
            </label>
          </div>

          <section className="voice-card">
            <div className="voice-card-head">
              <h3>화자 음색 선택</h3>
              <p>각 캐릭터에 어울리는 목소리를 골라줘.</p>
            </div>

            <div className="field-grid two-up">
              <div className="voice-select-group">
                <label>
                  <span>화자 1 음색</span>
                  <select value={form.speaker1Voice} onChange={(event) => handleChange('speaker1Voice', event.target.value)}>
                    {voiceOptions.map((voice) => (
                      <option key={voice} value={voice}>
                        {voice}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="preview-button"
                  onClick={() => handlePreview('speaker1')}
                  disabled={previewLoading === 'speaker1'}
                >
                  {previewLoading === 'speaker1' ? '재생 중...' : '화자 1 미리듣기'}
                </button>
              </div>

              <div className="voice-select-group">
                <label>
                  <span>화자 2 음색</span>
                  <select value={form.speaker2Voice} onChange={(event) => handleChange('speaker2Voice', event.target.value)}>
                    {voiceOptions.map((voice) => (
                      <option key={voice} value={voice}>
                        {voice}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="preview-button"
                  onClick={() => handlePreview('speaker2')}
                  disabled={previewLoading === 'speaker2'}
                >
                  {previewLoading === 'speaker2' ? '재생 중...' : '화자 2 미리듣기'}
                </button>
              </div>
            </div>

            <audio ref={previewAudioRef} className="sr-only" />
          </section>

          <label>
            <span>대사 요청</span>
            <textarea
              rows="6"
              value={form.prompt}
              onChange={(event) => handleChange('prompt', event.target.value)}
              placeholder="어떤 상황으로 대화를 만들지 적어줘"
            />
          </label>

          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? '생성 중...' : '2인극 생성하기'}
          </button>
        </form>

        <section className="panel output-panel">
          <div className="output-head">
            <h2>생성 결과</h2>
            <p>대본과 음성이 함께 만들어져.</p>
          </div>

          <article className="script-card">
            <h3>스크립트</h3>
            <pre>{script || '아직 생성된 장면이 없어. 왼쪽에서 조건을 넣고 만들어봐.'}</pre>
          </article>

          <article className="audio-card">
            <h3>오디오</h3>
            <audio ref={audioRef} controls className="audio-player" src={audioUrl || undefined} />

            {audioUrl ? (
              <div className="audio-actions">
                <a className="download-button" href={audioUrl} download={`ai-two-drama.${extensionFromMime(audioMimeType)}`}>
                  오디오 파일 다운로드
                </a>
              </div>
            ) : (
              <p>아직 오디오 파일이 없어.</p>
            )}

            <p>Cloudflare Pages Function이 Gemini API 키를 숨기고 대신 호출해.</p>
          </article>
        </section>
      </section>
    </main>
  )
}

function extensionFromMime(mimeType) {
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'wav'
}

export default App
