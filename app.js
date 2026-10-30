let config = null;
let editingId = null;

const taskForm = document.getElementById('task-form');
const taskTitle = document.getElementById('task-title');
const taskDescription = document.getElementById('task-description');
const taskNickname = document.getElementById('task-nickname');
const taskDue = document.getElementById('task-due');
const taskSubmit = document.getElementById('task-submit');
const taskCancel = document.getElementById('task-cancel');
const taskList = document.getElementById('task-list');
const statusMessage = document.getElementById('status-message');

async function loadConfig() {
  const res = await fetch('config.json');
  if (!res.ok) throw new Error('Failed to load config.json');
  config = await res.json();
}

function showMessage(text, type = 'error') {
  if (!text) {
    statusMessage.className = '';
    statusMessage.textContent = '';
    return;
  }
  statusMessage.textContent = text;
  statusMessage.className = type;
}

function apiUrl(query = '') {
  return `${config.supabaseUrl}/rest/v1/${config.tableName}${query}`;
}

function apiHeaders(extra = {}) {
  return {
    'apikey': config.supabasePublishableKey,
    'Authorization': `Bearer ${config.supabasePublishableKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...extra
  };
}

async function fetchTasks() {
  showMessage('');
  const res = await fetch(apiUrl('?select=*&order=id.asc'), {
    headers: apiHeaders()
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to load tasks: ${err}`);
  }
  const tasks = await res.json();
  renderTasks(tasks);
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function isOverdue(task) {
  if (!task.due_at || task.completed) return false;
  return new Date(task.due_at).getTime() < Date.now();
}

function renderTasks(tasks) {
  taskList.innerHTML = '';
  if (!tasks.length) {
    taskList.innerHTML = '<p class="empty">No tasks yet. Add your first one above.</p>';
    return;
  }

  tasks.forEach(task => {
    const overdue = isOverdue(task);
    const div = document.createElement('div');
    div.className = 'task-item' + (task.completed ? ' completed' : '');
    div.dataset.id = task.id;

    const badgeClass = task.completed ? 'done' : (overdue ? 'overdue' : 'pending');
    const badgeText = task.completed ? 'Completed' : (overdue ? 'Overdue' : 'Pending');

    const nicknameHtml = task.nickname
      ? `<span class="meta-nickname">Nickname: <strong>${escapeHtml(task.nickname)}</strong></span>`
      : '';

    const dueFormatted = formatDate(task.due_at);
    const dueHtml = dueFormatted
      ? `<span class="meta-due">Due: <strong>${escapeHtml(dueFormatted)}</strong></span>`
      : '';

    div.innerHTML = `
      <div class="task-top">
        <h3 class="task-title">${escapeHtml(task.title)}</h3>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
      <div class="task-meta">${nicknameHtml}${dueHtml}</div>
      <div class="task-actions">
        <button class="toggle-task ${task.completed ? 'undo' : ''}">
          ${task.completed ? 'Mark Incomplete' : 'Mark Complete'}
        </button>
        <button class="edit-task">Edit</button>
        <button class="delete-task">Delete</button>
      </div>
    `;

    div.querySelector('.toggle-task').addEventListener('click', () => toggleTask(task));
    div.querySelector('.edit-task').addEventListener('click', () => startEdit(task));
    div.querySelector('.delete-task').addEventListener('click', () => deleteTask(task.id));

    taskList.appendChild(div);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Convert datetime-local value (local time) to ISO UTC for Supabase */
function toIsoUtc(localValue) {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (isNaN(d)) return null;
  return d.toISOString();
}

/* Convert ISO UTC from Supabase back to datetime-local value */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startEdit(task) {
  editingId = task.id;
  taskTitle.value = task.title;
  taskDescription.value = task.description || '';
  taskNickname.value = task.nickname || '';
  taskDue.value = toLocalInput(task.due_at);
  taskSubmit.textContent = 'Save Changes';
  taskCancel.classList.add('visible');
  taskTitle.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  taskForm.reset();
  taskSubmit.textContent = 'Add Task';
  taskCancel.classList.remove('visible');
}

taskCancel.addEventListener('click', () => {
  resetForm();
  showMessage('');
});

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  showMessage('');
  const res = await fetch(apiUrl(`?id=eq.${id}`), {
    method: 'DELETE',
    headers: apiHeaders()
  });
  if (!res.ok) {
    showMessage('Failed to delete task.');
    return;
  }
  await fetchTasks();
}

async function toggleTask(task) {
  showMessage('');
  const res = await fetch(apiUrl(`?id=eq.${task.id}`), {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify({ completed: !task.completed })
  });
  if (!res.ok) {
    showMessage('Failed to update task status.');
    return;
  }
  await fetchTasks();
}

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMessage('');

  const title = taskTitle.value.trim();
  const description = taskDescription.value.trim();
  const nickname = taskNickname.value.trim();
  const dueLocal = taskDue.value;

  if (!title) {
    showMessage('Title is required.');
    return;
  }

  const payload = {
    title,
    description: description || null,
    nickname: nickname || null,
    due_at: toIsoUtc(dueLocal)
  };

  try {
    if (editingId) {
      const res = await fetch(apiUrl(`?id=eq.${editingId}`), {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
    } else {
      const res = await fetch(apiUrl(), {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ ...payload, completed: false })
      });
      if (!res.ok) throw new Error(await res.text());
    }
    resetForm();
    await fetchTasks();
    showMessage('Saved.', 'success');
    setTimeout(() => showMessage(''), 2200);
  } catch (err) {
    showMessage('Operation failed: ' + err.message);
  }
});

(async function init() {
  try {
    await loadConfig();
    await fetchTasks();
  } catch (err) {
    showMessage('Initialization error: ' + err.message);
  }
})();