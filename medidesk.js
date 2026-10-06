const API_BASE = 'http://localhost:5000'
const TOKEN_KEY = 'medidesk-download-token'
const USER_KEY = 'medidesk-download-user'

const authPanel = document.querySelector('#auth-panel')
const workspace = document.querySelector('#workspace')
const loginForm = document.querySelector('#login-form')
const doctorList = document.querySelector('#doctor-list')
const appointmentList = document.querySelector('#appointment-list')
const toast = document.querySelector('#toast')
const logoutButton = document.querySelector('#logout-button')
const sessionLabel = document.querySelector('#session-label')
let currentUser = readStoredUser()
let toastTimer

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch {
    throw new Error('Cannot reach the MediDesk API. Start it with npm run server and try again.')
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status}).`)
  return payload
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer)
  toast.textContent = message
  toast.style.background = isError ? '#991b1b' : '#0f172a'
  toast.classList.remove('hidden')
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500)
}

function setSignedIn(signedIn) {
  authPanel.classList.toggle('hidden', signedIn)
  workspace.classList.toggle('hidden', !signedIn)
  logoutButton.classList.toggle('hidden', !signedIn)
  sessionLabel.textContent = signedIn ? `${currentUser.name} · ${currentUser.role}` : 'Not signed in'
  if (signedIn) document.querySelector('#welcome-title').textContent = `Welcome, ${currentUser.name}`
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

async function loadDashboard() {
  const data = await request('/api/dashboard')
  currentUser = data.user || currentUser
  localStorage.setItem(USER_KEY, JSON.stringify(currentUser))
  setSignedIn(true)
  renderDoctors(data.doctors || [], data.appointments || [])
  renderAppointments(data.appointments || [])
}

function renderDoctors(doctors, appointments) {
  document.querySelector('#doctor-count').textContent = `${doctors.length} doctor${doctors.length === 1 ? '' : 's'}`
  if (!doctors.length) {
    doctorList.innerHTML = '<div class="empty-state">No doctors are currently available.</div>'
    return
  }

  doctorList.innerHTML = doctors.map((doctor) => {
    const booked = appointments.filter((item) => item.doctorId === doctor.id && item.status === 'upcoming').length
    const remaining = Math.max(0, Number(doctor.maxAppointments || 5) - booked)
    const available = (doctor.availability || []).map(escapeHtml).join(' · ') || 'Contact clinic'
    return `<article class="doctor-card">
      <h3>${escapeHtml(doctor.name)}</h3>
      <div class="specialty">${escapeHtml(doctor.specialization)}</div>
      <div class="clinic"><strong>${escapeHtml(doctor.clinic || 'Clinic details unavailable')}</strong><span>${escapeHtml(doctor.location || '')}</span></div>
      <div class="doctor-meta"><span>${escapeHtml(doctor.experience || '')}</span><span>₹${escapeHtml(doctor.fee || '—')}</span></div>
      <p class="muted"><small>Available times: ${available}</small></p>
      <p class="muted"><strong>${remaining ? `${remaining} appointments remaining` : 'No appointments remaining'}</strong></p>
      <button class="button button-primary" type="button" data-book-doctor="${escapeHtml(doctor.id)}" ${remaining ? '' : 'disabled'}>${remaining ? 'Book appointment' : 'Fully booked'}</button>
    </article>`
  }).join('')

  doctorList.querySelectorAll('[data-book-doctor]').forEach((button) => {
    button.addEventListener('click', () => openBookingForm(button.dataset.bookDoctor))
  })
}

function openBookingForm(doctorId) {
  const doctor = doctorId
  const card = [...doctorList.querySelectorAll('.doctor-card')].find((item) => item.querySelector(`[data-book-doctor="${CSS.escape(doctor)}"]`))
  if (!card) return
  const previous = card.querySelector('.booking-form')
  if (previous) {
    previous.remove()
    return
  }

  const form = document.createElement('form')
  form.className = 'booking-form'
  form.innerHTML = `
    <label>Date<input name="date" type="date" min="${new Date().toISOString().slice(0, 10)}" required></label>
    <label>Time<input name="time" type="time" required></label>
    <label>Reason<input name="reason" maxlength="200" required placeholder="Reason for visit"></label>
    <button class="button button-primary button-wide" type="submit">Confirm booking</button>
  `
  card.append(form)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const fields = new FormData(form)
    try {
      await request('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          doctorId,
          patientId: currentUser.id,
          date: fields.get('date'),
          time: fields.get('time'),
          reason: fields.get('reason'),
        }),
      })
      showToast('Appointment booked successfully.')
      await loadDashboard()
    } catch (error) {
      showToast(error.message, true)
    }
  })
}

function renderAppointments(appointments) {
  const ownAppointments = appointments.filter((item) => item.patientId === currentUser.id)
  if (!ownAppointments.length) {
    appointmentList.innerHTML = '<div class="empty-state">No appointments yet. Choose a doctor above to book your first visit.</div>'
    return
  }

  appointmentList.innerHTML = ownAppointments.map((appointment) => `
    <article class="appointment-card">
      <div>
        <strong>${escapeHtml(appointment.doctorName)}</strong>
        <p>${escapeHtml(appointment.reason)}</p>
        <p>${escapeHtml(appointment.date)} · ${escapeHtml(appointment.time)}</p>
        <span class="status-tag">${escapeHtml(appointment.status)}</span>
      </div>
      ${appointment.status === 'upcoming' ? `<div class="appointment-actions">
        <button class="button button-quiet" type="button" data-reschedule="${escapeHtml(appointment.id)}">Reschedule</button>
        <button class="button button-quiet" type="button" data-cancel="${escapeHtml(appointment.id)}">Cancel</button>
      </div>` : ''}
    </article>
  `).join('')

  appointmentList.querySelectorAll('[data-cancel]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await request(`/api/appointments/${encodeURIComponent(button.dataset.cancel)}`, { method: 'DELETE' })
        showToast('Appointment cancelled.')
        await loadDashboard()
      } catch (error) {
        showToast(error.message, true)
      }
    })
  })

  appointmentList.querySelectorAll('[data-reschedule]').forEach((button) => {
    button.addEventListener('click', () => openRescheduleForm(button.dataset.reschedule))
  })
}

function openRescheduleForm(appointmentId) {
  const card = [...appointmentList.querySelectorAll('.appointment-card')].find((item) =>
    item.querySelector(`[data-reschedule="${CSS.escape(appointmentId)}"]`))
  if (!card) return
  if (card.querySelector('.reschedule-form')) {
    card.querySelector('.reschedule-form').remove()
    return
  }
  const form = document.createElement('form')
  form.className = 'reschedule-form'
  form.innerHTML = `
    <label>New date<input name="date" type="date" min="${new Date().toISOString().slice(0, 10)}" required></label>
    <label>New time<input name="time" type="time" required></label>
    <button class="button button-primary" type="submit">Save new time</button>
  `
  card.append(form)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const fields = new FormData(form)
    try {
      await request(`/api/appointments/${encodeURIComponent(appointmentId)}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ date: fields.get('date'), time: fields.get('time') }),
      })
      showToast('Appointment rescheduled.')
      await loadDashboard()
    } catch (error) {
      showToast(error.message, true)
    }
  })
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const email = document.querySelector('#login-email').value.trim()
  const password = document.querySelector('#login-password').value
  const role = document.querySelector('#login-role').value
  try {
    const result = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    })
    localStorage.setItem(TOKEN_KEY, result.token)
    currentUser = result.user
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser))
    setSignedIn(true)
    await loadDashboard()
    showToast(`Signed in as ${currentUser.name}.`)
  } catch (error) {
    showToast(error.message, true)
  }
})

logoutButton.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  currentUser = null
  setSignedIn(false)
})

document.querySelector('#refresh-button').addEventListener('click', async () => {
  try {
    await loadDashboard()
    showToast('Appointments refreshed.')
  } catch (error) {
    showToast(error.message, true)
  }
})

if (currentUser && localStorage.getItem(TOKEN_KEY)) {
  loadDashboard().catch((error) => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    currentUser = null
    setSignedIn(false)
    showToast(error.message, true)
  })
} else {
  setSignedIn(false)
}
