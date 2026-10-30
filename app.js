let config = null;
let editingId = null;

const taskForm = document.getElementById('task-form');
const taskTitle = document.getElementById('task-title');
const taskDescription = document.getElementById('task-description');
const taskSubmit = document.getElementById('task-submit');
const taskList = document.getElementById('task-list');
const statusMessage = document.getElementById('status-message');

async function loadConfig() {
  const res = await fetch('config.json');
  if (!res.ok) throw new Error('Failed to load config.json');
  config = await res.json();
}

function showMessage(text, type = 'error') {
  statusMessage.textContent = text;
  statusMessage.className = type;
  if (!text) statusMessage.className = '';
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

function renderTasks(tasks) {
  taskList.innerHTML = '';
  if (!tasks.length) {
    taskList.innerHTML = '<p>No tasks yet. Add one above.</p>';
    return;
  }
  tasks.forEach(task => {
    const div = document.createElement('div');
    div.className = 'task-item' + (task.completed ? ' completed' : '');
    div.dataset.id = task.id;
    div.innerHTML = `
      <div class="task-title">${escapeHtml(task.title)}</div>
      <div class="task-description">${escapeHtml(task.description || '')}</div>
      <div class="task-status">${task.completed ? 'Completed' : 'Incomplete'}</div>
      <div class="task-actions">
        <button class="toggle-task">${task.completed ? 'Mark Incomplete' : 'Mark Complete'}</button>
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

function startEdit(task) {
  editingId = task.id;
  taskTitle.value = task.title;
  taskDescription.value = task.description || '';
  taskSubmit.textContent = 'Save Changes';
  taskTitle.focus();
}

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
  if (!title) {
    showMessage('Title is required.');
    return;
  }

  try {
    if (editingId) {
      const res = await fetch(apiUrl(`?id=eq.${editingId}`), {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({ title, description: description || null })
      });
      if (!res.ok) throw new Error(await res.text());
      editingId = null;
      taskSubmit.textContent = 'Add Task';
    } else {
      const res = await fetch(apiUrl(), {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ title, description: description || null, completed: false })
      });
      if (!res.ok) throw new Error(await res.text());
    }
    taskForm.reset();
    await fetchTasks();
    showMessage('Saved.', 'success');
    setTimeout(() => showMessage(''), 2000);
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