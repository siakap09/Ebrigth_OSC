'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { toast } from 'sonner'

// Public trial form shows the 21 English-speaking branches plus Ebright OD
// (the stress-test / training branch). HR is excluded — it has no pipeline.
// Display uses the prefixed DB name, but value is still the short location.
const BRANCHES = [
  '00 Ebright OD',
  '01 Ebright Public Speaking (Rimbayu)',
  '02 Ebright Public Speaking (Klang)',
  '03 Ebright Public Speaking (Shah Alam)',
  '04 Ebright Public Speaking (Setia Alam)',
  '05 Ebright Public Speaking (Denai Alam)',
  '06 Ebright Public Speaking (Eco Grandeur)',
  '07 Ebright Public Speaking (Subang Taipan)',
  '08 Ebright Public Speaking (Danau Kota)',
  '09 Ebright Public Speaking (Kota Damansara)',
  '10 Ebright Public Speaking (Ampang)',
  '11 Ebright Public Speaking (Sri Petaling)',
  '12 Ebright Public Speaking (Bandar Tun Hussein Onn)',
  '13 Ebright Public Speaking (Kajang TTDI Grove)',
  '14 Ebright Public Speaking (Taman Sri Gombak)',
  '15 Ebright Public Speaking (Putrajaya)',
  '16 Ebright Public Speaking (Kota Warisan)',
  '17 Ebright Public Speaking (Bandar Baru Bangi)',
  '18 Ebright Public Speaking (Cyberjaya)',
  '19 Ebright Public Speaking (Bandar Seri Putra)',
  '20 Ebright Public Speaking (Dataran Puchong Utama)',
  '21 Ebright Public Speaking (Online)',
]

interface Child {
  name: string
  age: string
}

export default function FormsPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [numChildren, setNumChildren] = useState(0)
  const [children, setChildren] = useState<Child[]>([])
  const [branch, setBranch] = useState('')
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Sync children array length with numChildren selection
    setChildren((prev) => {
      const next = [...prev]
      while (next.length < numChildren) next.push({ name: '', age: '' })
      while (next.length > numChildren) next.pop()
      return next
    })
  }, [numChildren])

  const progress = step === 5 ? 100 : (step / 4) * 100

  function validateStep1(): boolean {
    if (!parentName.trim() || !parentPhone.trim() || !parentEmail.trim()) {
      toast.error('Please fill in all required parent details')
      return false
    }
    if (!parentEmail.includes('@')) {
      toast.error('Please enter a valid email address')
      return false
    }
    return true
  }

  function validateStep3(): boolean {
    for (let i = 0; i < children.length; i++) {
      if (!children[i].name.trim() || !children[i].age) {
        toast.error(`Please fill in all details for Child ${i + 1}`)
        return false
      }
    }
    return true
  }

  function next() {
    if (step === 1 && !validateStep1()) return
    if (step === 2 && numChildren === 0) {
      toast.error('Please select the number of children')
      return
    }
    if (step === 3 && !validateStep3()) return
    setStep((s) => Math.min(5, (s + 1)) as 1 | 2 | 3 | 4 | 5)
  }

  function prev() {
    setStep((s) => Math.max(1, (s - 1)) as 1 | 2 | 3 | 4 | 5)
  }

  async function submit() {
    if (!branch) {
      toast.error('Please select a branch')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/crm/forms/trial-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentName,
          parentPhone,
          parentEmail,
          numChildren,
          children,
          preferredBranch: branch,
          remarks,
        }),
      })
      if (!res.ok) throw new Error(await res.text().catch(() => 'Failed'))
      toast.success('Registration submitted')
      setStep(5)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setStep(1)
    setParentName('')
    setParentPhone('')
    setParentEmail('')
    setNumChildren(0)
    setChildren([])
    setBranch('')
    setRemarks('')
  }

  return (
    <div
      className="bg-slate-50 dark:bg-slate-900"
      style={{
        minHeight: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '24px 14px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#fff',
          borderRadius: 22,
          boxShadow: '0 18px 45px rgba(0,0,0,.20)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg,#ed1c24 0%,#ff3d3d 100%)',
            color: '#fff',
            textAlign: 'center',
            padding: '26px 20px 18px',
          }}
        >
          <h1 style={{ fontSize: 36, lineHeight: 1.05, fontWeight: 800, textShadow: '0 3px 10px rgba(0,0,0,.15)', marginBottom: 6 }}>
            Trial Class
          </h1>
          <p style={{ fontSize: 16, opacity: 0.95, marginBottom: 14 }}>Registration</p>
          <div style={{ height: 7, width: '100%', background: 'rgba(255,255,255,.45)', borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'rgba(255,255,255,.92)',
                borderRadius: 999,
                transition: 'width .45s ease',
              }}
            />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '28px 26px 30px', minHeight: 400 }}>
          {step === 1 && (
            <Fade>
              <Group label="Parent's Name" required>
                <Field value={parentName} onChange={setParentName} placeholder="Example: Jonathan Tan, Sara Yahya, Muthu" />
              </Group>
              <Group label="Parent's Contact" required help="Reminders will be sent via WhatsApp, please make sure your number has WhatsApp function.">
                <Field value={parentPhone} onChange={setParentPhone} type="tel" placeholder="0123456789" />
              </Group>
              <Group label="Parent's Email" required>
                <Field value={parentEmail} onChange={setParentEmail} type="email" placeholder="Example: Ebright@gmail.com" />
              </Group>
              <NextBtn onClick={next} />
            </Fade>
          )}

          {step === 2 && (
            <Fade>
              <Group label="How many children are joining?">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 14 }}>
                  {[1, 2, 3, 4].map((n) => {
                    const selected = numChildren === n
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setNumChildren(n)}
                        style={{
                          height: 70,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: `3px solid ${selected ? '#ed1c24' : '#e7e7e7'}`,
                          borderRadius: 16,
                          background: selected ? 'linear-gradient(135deg,#ed1c24 0%,#ff3d3d 100%)' : '#fff',
                          fontSize: 26,
                          fontWeight: 900,
                          color: selected ? '#fff' : '#666',
                          cursor: 'pointer',
                          transition: 'transform .15s ease, border-color .2s, box-shadow .2s',
                          fontFamily: 'Arial,sans-serif',
                        }}
                      >
                        {n}
                      </button>
                    )
                  })}
                </div>
              </Group>
              {numChildren > 0 && <NextBtn onClick={next} />}
              <BackBtn onClick={prev} />
            </Fade>
          )}

          {step === 3 && (
            <Fade>
              <div style={{ display: 'grid', gap: 14, marginTop: 10 }}>
                {children.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                      padding: 16,
                      background: '#f7f7f7',
                      borderRadius: 16,
                      border: '2px solid #eee',
                    }}
                  >
                    <h3 style={{ gridColumn: '1 / -1', color: '#ed1c24', fontSize: 16, fontWeight: 900, marginBottom: 4 }}>Child {i + 1}</h3>
                    <Group label="Child's Name" required>
                      <Field
                        value={c.name}
                        onChange={(v) =>
                          setChildren((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: v } : x)))
                        }
                        placeholder="Example: Adam Bin Nik"
                      />
                    </Group>
                    <Group label="Child's Age" required>
                      <Field
                        type="number"
                        value={c.age}
                        onChange={(v) =>
                          setChildren((prev) => prev.map((x, idx) => (idx === i ? { ...x, age: v } : x)))
                        }
                        placeholder="Example: 8"
                      />
                    </Group>
                  </div>
                ))}
              </div>
              <NextBtn onClick={next} />
              <BackBtn onClick={prev} />
            </Fade>
          )}

          {step === 4 && (
            <Fade>
              <Group label="Preferred branch near you">
                <SelectField value={branch} onChange={setBranch} placeholder="Please select" options={BRANCHES} />
              </Group>
              <Group label="Remarks [If any]">
                <TextareaField value={remarks} onChange={setRemarks} placeholder="Special needs (e.g. ADHD, autism)" />
              </Group>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                style={{
                  ...btnBase,
                  marginTop: 16,
                  background: 'linear-gradient(135deg,#ed1c24 0%,#ff3d3d 100%)',
                  color: '#fff',
                  boxShadow: '0 14px 26px rgba(237,28,36,.18)',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'SUBMITTING…' : 'SUBMIT'}
              </button>
              <BackBtn onClick={prev} />
            </Fade>
          )}

          {step === 5 && (
            <Fade>
              <div style={{ textAlign: 'center', padding: '40px 10px 20px' }}>
                <div style={{ fontSize: 96, lineHeight: 1, color: '#22c55e', marginBottom: 12 }}>✓</div>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a1a', marginBottom: 14 }}>Registration Successful!</h1>
                <p style={{ fontSize: 15, color: '#555', lineHeight: 1.55, maxWidth: 360, margin: '0 auto' }}>
                  A new lead has been added to Opportunities → New Lead. We will contact the parent shortly via WhatsApp to confirm the trial class schedule.
                </p>
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    ...btnBase,
                    marginTop: 24,
                    background: '#ed1c24',
                    color: '#fff',
                    boxShadow: '0 14px 26px rgba(237,28,36,.18)',
                  }}
                >
                  SUBMIT ANOTHER
                </button>
              </div>
            </Fade>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared reusable bits ─────────────────────────────────────────────────────

function Fade({ children }: { children: React.ReactNode }) {
  return <div style={{ animation: 'ebright-fade .35s ease' }}>{children}<style>{`@keyframes ebright-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style></div>
}

function Group({
  label,
  required,
  help,
  children,
}: {
  label: string
  required?: boolean
  help?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontWeight: 800, fontSize: 18, color: '#2a2a2a', marginBottom: 10 }}>
        {label}
        {required && <span style={{ color: '#ed1c24', marginLeft: 6 }}>*</span>}
      </label>
      {children}
      {help && (
        <div style={{ marginTop: 10, fontSize: 14, color: '#666', fontStyle: 'italic', lineHeight: 1.35 }}>{help}</div>
      )}
    </div>
  )
}

function inputStyle(filled: boolean): CSSProperties {
  return {
    width: '100%',
    height: 52,
    padding: '0 16px',
    border: `3px solid ${filled ? '#ffb000' : '#e6e6e6'}`,
    borderRadius: 16,
    fontSize: 16,
    color: '#333',
    outline: 'none',
    // Use backgroundColor (not the `background` shorthand) so SelectField can
    // add backgroundImage/backgroundPosition without React warning about mixed shorthand.
    backgroundColor: filled ? '#fff9e6' : '#fff',
    fontFamily: 'Arial,sans-serif',
    transition: 'border-color .2s, box-shadow .2s, background-color .2s',
  }
}

function Field({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  const filled = value.trim() !== ''
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={inputStyle(filled)}
      onFocus={(e) => (e.currentTarget.style.borderColor = '#ed1c24')}
      onBlur={(e) => (e.currentTarget.style.borderColor = filled ? '#ffb000' : '#e6e6e6')}
    />
  )
}

function SelectField({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: string[]
}) {
  const filled = value.trim() !== ''
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...inputStyle(filled),
        appearance: 'none',
        paddingRight: 40,
        backgroundImage:
          'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2.5\'><polyline points=\'6 9 12 15 18 9\'></polyline></svg>")',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 14px center',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

function TextareaField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const filled = value.trim() !== ''
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...inputStyle(filled),
        height: 'auto',
        minHeight: 110,
        padding: '14px 16px',
        resize: 'vertical',
      }}
    />
  )
}

const btnBase: CSSProperties = {
  width: '100%',
  height: 58,
  border: 'none',
  borderRadius: 18,
  fontSize: 18,
  fontWeight: 900,
  letterSpacing: 2,
  cursor: 'pointer',
  textTransform: 'uppercase',
  transition: 'transform .12s ease, box-shadow .2s ease',
  fontFamily: 'Arial,sans-serif',
}

function NextBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...btnBase,
        marginTop: 16,
        background: '#ed1c24',
        color: '#fff',
        boxShadow: '0 14px 26px rgba(237,28,36,.18)',
      }}
    >
      NEXT
    </button>
  )
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...btnBase,
        marginTop: 12,
        background: '#e6e6e6',
        color: '#6b6b6b',
        letterSpacing: 1,
      }}
    >
      BACK
    </button>
  )
}
