function createUsernameInput(id) {
	const username_row = document.createElement('tr');
	const username_header = document.createElement('th');
	const username_label = document.createElement('label');
	username_label.innerText = 'Username';
	username_label.setAttribute('for', id);
	username_header.appendChild(username_label);
	username_row.appendChild(username_header)
	const username_container = document.createElement('td');
	const username_input = document.createElement('input');
	username_input.type = 'text'
	username_input.id = id;
	username_container.appendChild(username_input);
	username_row.appendChild(username_container);
	return username_row;
};

function createPasswordInput(id) {
	const password_row = document.createElement('tr');
	const password_header = document.createElement('th');
	const password_label = document.createElement('label');
	password_label.innerText = 'Password';
	password_label.setAttribute('for', id);
	password_header.appendChild(password_label);
	password_row.appendChild(password_header)
	const password_container = document.createElement('td');
	const password_input = document.createElement('input');
	password_input.type = 'password'
	password_input.id = id;
	password_container.appendChild(password_input);
	password_row.appendChild(password_container);
	return password_row;
};

function createApiTokenInput(id) {
	const token_row = document.createElement('tr');
	const token_header = document.createElement('th');
	const token_label = document.createElement('label');
	token_label.innerText = 'API Token';
	token_label.setAttribute('for', id);
	token_header.appendChild(token_label);
	token_row.appendChild(token_header)
	const token_container = document.createElement('td');
	const token_input = document.createElement('input');
	token_input.type = 'text'
	token_input.id = id;
	token_container.appendChild(token_input);
	token_row.appendChild(token_container);
	return token_row;
};

function loadEditTorrent(api_key, id) {
	const form = document.querySelector('#edit-torrent-form tbody');
	form.dataset.id = id;
	form.querySelectorAll(
		'tr:not(:has(input#edit-title-input, input#edit-baseurl-input))'
	).forEach(el => el.remove());
	document.querySelector('#test-torrent-edit').classList.remove(
		'show-success', 'show-fail'
	)
	hide([document.querySelector('#edit-error')]);

	fetchAPI(`/externalclients/${id}`, api_key)
	.then(client_data => {
		const client_type = client_data.result.client_type;
		form.dataset.type = client_type;
		fetchAPI('/externalclients/options', api_key)
		.then(options => {
			const client_options = options.result[client_type];

			form.querySelector('#edit-title-input').value =
				client_data.result.title || '';

			form.querySelector('#edit-baseurl-input').value =
				client_data.result.base_url;

			if (client_options.includes('username')) {
				const username_input = createUsernameInput('edit-username-input');
				username_input.querySelector('input').value =
					client_data.result.username || '';
				form.appendChild(username_input);
			};

			if (client_options.includes('password')) {
				const password_input = createPasswordInput('edit-password-input');
				password_input.querySelector('input').value =
					client_data.result.password || '';
				form.appendChild(password_input);
			};

			if (client_options.includes('api_token')) {
				const token_input = createApiTokenInput('edit-token-input');
				token_input.querySelector('input').value =
					client_data.result.api_token || '';
				form.appendChild(token_input);
			};

			showWindow('edit-torrent-window');
		});
	});
};

function saveEditTorrent() {
	usingApiKey()
	.then(api_key => {
		testEditTorrent(api_key).then(result => {
			if (!result)
				return;

			const form = document.querySelector('#edit-torrent-form tbody');
			const id = form.dataset.id;
			const data = {
				title: form.querySelector('#edit-title-input').value,
				base_url: form.querySelector('#edit-baseurl-input').value,
				username: form.querySelector('#edit-username-input')?.value || null,
				password: form.querySelector('#edit-password-input')?.value || null,
				api_token: form.querySelector('#edit-token-input')?.value || null
			};
			sendAPI('PUT', `/externalclients/${id}`, api_key, {}, data)
			.then(response => {
				loadTorrentClients(api_key);
				closeWindow();
			})
			.catch(e => {
				e.json().then(json => {
					const error = document.querySelector('#edit-error');
					if (json.error === "ExternalClientDownloading") {
						// Client is downloading
						error.innerText = '*Client is downloading';
						hide([], [error]);

					} else if (
						json.error === "InvalidKeyValue"
						&& json.result.key === "password"
					) {
						error.innerText = "*Username given but no password";
						hide([], [error]);
					};
				});
			});
		});
	});
};

async function testEditTorrent(api_key) {
	const error = document.querySelector('#edit-error');
	hide([error]);
	const form = document.querySelector('#edit-torrent-form tbody');
	const test_button = document.querySelector('#test-torrent-edit');
	test_button.classList.remove('show-success', 'show-fail');
	const data = {
		client_type: form.dataset.type,
		base_url: form.querySelector('#edit-baseurl-input').value,
		username: form.querySelector('#edit-username-input')?.value || null,
		password: form.querySelector('#edit-password-input')?.value || null,
		api_token: form.querySelector('#edit-token-input')?.value || null,
	};
	return await sendAPI('POST', '/externalclients/test', api_key, {}, data)
	.then(response => response.json())
	.then(json => {
		if (json.result.success)
			// Test successful
			test_button.classList.add('show-success');
		else {
			// Test failed
			test_button.classList.add('show-fail');
			error.innerText = json.result.description;
			hide([], [error]);
		};
		return json.result.success;
	});
};

function deleteTorrent(api_key) {
	const id = document.querySelector('#edit-torrent-form tbody').dataset.id;
	sendAPI('DELETE', `/externalclients/${id}`, api_key)
	.then(response => {
		loadTorrentClients(api_key);
		fillRemoteMappings(api_key);
		closeWindow();
	})
	.catch(e => {
		if (e.status === 400) {
			// Client is downloading
			const error = document.querySelector('#edit-error');
			error.innerText = '*Client is downloading';
			hide([], [error]);
		};
	});
};

function loadTorrentList(api_key) {
	const table = document.querySelector('#choose-torrent-list');
	table.innerHTML = '';

	fetchAPI('/externalclients/options', api_key)
	.then(json => {
		Object.keys(json.result).forEach(c => {
			const entry = document.createElement('button');
			entry.innerText = c;
			entry.onclick = e => loadAddTorrent(api_key, c);
			table.appendChild(entry);
		});
		showWindow('choose-torrent-window');
	});
};

function loadAddTorrent(api_key, client_type) {
	const form = document.querySelector('#add-torrent-form tbody');
	form.dataset.type = client_type;
	form.querySelectorAll(
		'tr:not(:has(input#add-title-input, input#add-baseurl-input))'
	).forEach(el => el.remove());
	document.querySelector('#test-torrent-add').classList.remove(
		'show-success', 'show-fail'
	)
	form.querySelectorAll(
		'#add-title-input, #add-baseurl-input'
	).forEach(el => el.value = '');

	fetchAPI('/externalclients/options', api_key)
	.then(json => {
		const client_options = json.result[client_type];

		if (client_options.includes('username'))
			form.appendChild(createUsernameInput('add-username-input'));

		if (client_options.includes('password'))
			form.appendChild(createPasswordInput('add-password-input'));

		if (client_options.includes('api_token'))
			form.appendChild(createApiTokenInput('add-token-input'));

		showWindow('add-torrent-window');
	});
};

function saveAddTorrent() {
	usingApiKey()
	.then(api_key => {
		testAddTorrent(api_key).then(result => {
			if (!result)
				return;

			const form = document.querySelector('#add-torrent-form tbody');
			const data = {
				client_type: form.dataset.type,
				title: form.querySelector('#add-title-input').value,
				base_url: form.querySelector('#add-baseurl-input').value,
				username: form.querySelector('#add-username-input')?.value || null,
				password: form.querySelector('#add-password-input')?.value || null,
				api_token: form.querySelector('#add-token-input')?.value || null
			};
			sendAPI('POST', '/externalclients', api_key, {}, data)
			.then(response => {
				loadTorrentClients(api_key);
				closeWindow();
			})
			.catch(e => {
				e.json().then(json => {
					if (
						json.error === "InvalidKeyValue"
						&& json.result.key === "password"
					) {
						const error = document.querySelector('#add-error');
						error.innerText = "*Username given but no password";
						hide([], [error]);
					};
				});
			});
		});
	});
};

async function testAddTorrent(api_key) {
	const error = document.querySelector('#add-error');
	hide([error]);
	const form = document.querySelector('#add-torrent-form tbody');
	const test_button = document.querySelector('#test-torrent-add');
	test_button.classList.remove('show-success', 'show-fail');
	const data = {
		client_type: form.dataset.type,
		base_url: form.querySelector('#add-baseurl-input').value,
		username: form.querySelector('#add-username-input')?.value || null,
		password: form.querySelector('#add-password-input')?.value || null,
		api_token: form.querySelector('#add-token-input')?.value || null,
	};
	return await sendAPI('POST', '/externalclients/test', api_key, {}, data)
	.then(response => response.json())
	.then(json => {
		if (json.result.success)
			// Test successful
			test_button.classList.add('show-success');
		else
			// Test failed
			test_button.classList.add('show-fail');
			error.innerText = json.result.description;
			hide([], [error]);
		return json.result.success;
	});
};

function loadTorrentClients(api_key) {
	fetchAPI('/externalclients', api_key)
	.then(json => {
		const table = document.querySelector('#torrent-client-list'),
			add_mapping_select = document.querySelector('#add-mapping-client-input'),
			edit_mapping_select = document.querySelector('#edit-mapping-client-input');

		document.querySelectorAll('#torrent-client-list > :not(:first-child)')
			.forEach(el => el.remove());
		add_mapping_select.innerHTML = ''
		edit_mapping_select.innerHTML = ''

		json.result.forEach(client => {
			const entry = document.createElement('button');
			entry.onclick = (e) => loadEditTorrent(api_key, client.id);
			entry.innerText = client.title;
			table.appendChild(entry);

			const option = document.createElement('option');
			option.innerText = client.title;
			option.value = client.id;
			add_mapping_select.appendChild(option);
			edit_mapping_select.appendChild(option.cloneNode(true));
		});
	});
};

function fillCredentials(api_key) {
	fetchAPI('/credentials', api_key)
	.then(json => {
		document.querySelectorAll('#mega-creds, #pixeldrain-creds').forEach(
			c => c.innerHTML = ''
		);
		json.result.forEach(result => {
			if (result.source === 'mega') {
				const row = document.querySelector('.pre-build-els .mega-cred-entry').cloneNode(true);
				row.querySelector('.mega-email').innerText = result.email;
				row.querySelector('.mega-password').innerText = result.password;
				row.querySelector('.delete-credential').onclick =
					e => sendAPI('DELETE', `/credentials/${result.id}`, api_key)
						.then(response => row.remove());
				document.querySelector('#mega-creds').appendChild(row);
			}
			else if (result.source === 'pixeldrain') {
				const row = document.querySelector('.pre-build-els .pixeldrain-cred-entry').cloneNode(true);
				row.querySelector('.pixeldrain-key').innerText = result.api_key;
				row.querySelector('.delete-credential').onclick =
					e => sendAPI('DELETE', `/credentials/${result.id}`, api_key)
						.then(response => row.remove());
				document.querySelector('#pixeldrain-creds').appendChild(row);
			};
		});
	});

	document.querySelectorAll('#mega-form input, #pixeldrain-form input').forEach(
		i => i.value = ''
	);
};

function addCredential() {
	hide([document.querySelector('#builtin-window p.error')]);

	const source = document.querySelector("#builtin-window").dataset.tag;
	let data;
	if (source === 'mega')
		data = {
			source: source,
			email: document.querySelector('#add-mega .mega-email input').value,
			password: document.querySelector('#add-mega .mega-password input').value
		};

	else if (source === 'pixeldrain')
		data = {
			source: source,
			api_key: document.querySelector('#add-pixeldrain .pixeldrain-key input').value
		};

	usingApiKey().then(api_key => {
		sendAPI('POST', '/credentials', api_key, {}, data)
		.then(response => fillCredentials(api_key))
		.catch(e => {
			if (e.status === 400)
				e.json().then(json => {
					if (json.error === "CredentialInvalid") {
						document.querySelector('#builtin-window p.error').innerText = "Invalid credentials";
					} else {
						document.querySelector('#builtin-window p.error').innerText = json.result.reason_text;
					}
					hide([], [document.querySelector('#builtin-window p.error')]);
				});
			else
				console.log(e);
		});
	});
};

const remoteMappings = {}
async function fillRemoteMappings(api_key) {
	const table = document.querySelector("#remote-mapping-list")
	table.innerHTML = ''

	const externalClients = await fetchAPI('/externalclients', api_key)
	const clientNames = Object.fromEntries(
		externalClients.result.map(c => [c.id, c.title])
	)

	const remoteMappingsResult = await fetchAPI('/remotemapping', api_key)
	remoteMappingsResult.result.forEach(m => {
		remoteMappings[m.id] = m

		const row = document.querySelector('.pre-build-els .remote-mapping-entry').cloneNode(true)
		row.dataset.id = m.id
		row.querySelector(".mapping-client").innerText = clientNames[m.external_download_client_id]
		row.querySelector(".mapping-remote").innerText = m.remote_path
		row.querySelector(".mapping-local").innerText = m.local_path
		row.querySelector(".edit-mapping").onclick = e => showEditRemoteMapping(m.id)
		row.querySelector(".delete-mapping").onclick = e => deleteRemoteMapping(m.id)

		table.appendChild(row)
	})
}

function showAddRemoteMapping() {
	hide([document.querySelector('#add-mapping-error')])
	document.querySelector('#add-mapping-remote-input').value = ''
	document.querySelector('#add-mapping-local-input').value = ''
	showWindow("add-mapping-window")
}

async function addRemoteMapping() {
	const data = {
		external_download_client_id: parseInt(document.querySelector('#add-mapping-client-input').value),
		remote_path: document.querySelector('#add-mapping-remote-input').value,
		local_path: document.querySelector('#add-mapping-local-input').value
	}

	const api_key = await usingApiKey()
	sendAPI("POST", "/remotemapping", api_key, {}, data)
	.then(response => {
		fillRemoteMappings(api_key)
		closeWindow()
	})
	.catch(async e => {
		const json = await e.json()
		if (json.error === "FolderNotFound") {
			document.querySelector('#add-mapping-error').innerText = "Local folder not found"
		} else if (json.error === "RemoteMappingInvalid") {
			document.querySelector('#add-mapping-error').innerText = "The local path or remote path is a child or parent of another local/remote path for the client"
		}
		hide([], [document.querySelector("#add-mapping-error")])
	})
}

function showEditRemoteMapping(id) {
	const data = remoteMappings[id]

	document.querySelector("#edit-mapping-window").dataset.id = id
	hide([document.querySelector('#edit-mapping-error')])
	document.querySelector('#edit-mapping-client-input').value = data.external_download_client_id
	document.querySelector('#edit-mapping-remote-input').value = data.remote_path
	document.querySelector('#edit-mapping-local-input').value = data.local_path
	showWindow("edit-mapping-window")
}

async function editRemoteMapping() {
	const id = parseInt(document.querySelector("#edit-mapping-window").dataset.id),
		data = {
			external_download_client_id: parseInt(document.querySelector('#edit-mapping-client-input').value),
			remote_path: document.querySelector('#edit-mapping-remote-input').value,
			local_path: document.querySelector('#edit-mapping-local-input').value
		},
		api_key = await usingApiKey()
	
	sendAPI("PUT", `/remotemapping/${id}`, api_key, {}, data)
	.then(response => {
		fillRemoteMappings(api_key)
		closeWindow()
	})
	.catch(async e => {
		const json = await e.json()
		if (json.error === "FolderNotFound") {
			document.querySelector('#edit-mapping-error').innerText = "Local folder not found"
		} else if (json.error === "RemoteMappingInvalid") {
			document.querySelector('#edit-mapping-error').innerText = "The local path or remote path is a child or parent of another local/remote path for the client"
		}
		hide([], [document.querySelector("#edit-mapping-error")])
	})
}

async function deleteRemoteMapping(id) {
	const api_key = await usingApiKey()
	sendAPI("DELETE", `/remotemapping/${id}`, api_key)
	document.querySelector(`#remote-mapping-list > tr[data-id="${id}"]`).remove()
}


// code run on load

usingApiKey()
.then(api_key => {
	fillCredentials(api_key);
	loadTorrentClients(api_key);
	fillRemoteMappings(api_key);
	document.querySelector('#delete-torrent-edit').onclick = e => deleteTorrent(api_key);
	document.querySelector('#test-torrent-edit').onclick = e => testEditTorrent(api_key);
	document.querySelector('#test-torrent-add').onclick = e => testAddTorrent(api_key);
	document.querySelector('#add-torrent-client').onclick = e => loadTorrentList(api_key);
});

document.querySelector('#edit-torrent-form').action = 'javascript:saveEditTorrent()';
document.querySelector('#add-torrent-form').action = 'javascript:saveAddTorrent()';
document.querySelectorAll('#cred-container > form').forEach(
	f => f.action = 'javascript:addCredential();'
);
document.querySelectorAll('#builtin-client-list > button').forEach(b => {
	const tag = b.dataset.tag;
	b.onclick = e => {
		document.querySelector('#builtin-window').dataset.tag = tag;
		hide([document.querySelector('#builtin-window p.error')]);
		document.querySelectorAll('#builtin-window input').forEach(i => i.value = '');

		showWindow('builtin-window');
	};
});
document.querySelector('#add-mapping-form').action = 'javascript:addRemoteMapping()'
document.querySelector('#add-remote-mapping').onclick = e => showAddRemoteMapping()
document.querySelector('#edit-mapping-form').action = 'javascript:editRemoteMapping()'


// region Usenet Client Management

// Fetch and display usenet clients
async function fetchUsenetClients() {
	try {
		const response = await fetch('/api/download_clients/usenet');
		const result = await response.json();

		if (response.status === 200) {
			displayUsenetClients(result);
		} else {
			console.error('Failed to fetch usenet clients:', result);
		}
	} catch (e) {
		console.error('Error fetching usenet clients:', e);
	}
}

// Display usenet clients in the list
function displayUsenetClients(clients) {
	const container = document.getElementById('usenet-client-list');
	if (!container) return;

	container.innerHTML = '';

	if (clients.length === 0) {
		const emptyMsg = document.createElement('p');
		emptyMsg.textContent = 'No usenet clients configured.';
		emptyMsg.className = 'empty-message';
		container.appendChild(emptyMsg);
		return;
	}

	clients.forEach(client => {
		const card = document.createElement('div');
		card.className = 'client-card';
		card.innerHTML = `
			<div class="client-info">
				<h3>${client.title}</h3>
				<p class="client-url">${client.base_url}</p>
			</div>
			<div class="client-actions">
				<button class="edit-button" data-id="${client.id}">Edit</button>
				<button class="test-button" data-id="${client.id}">Test</button>
			</div>
		`;
		container.appendChild(card);
	});

	// Add event listeners
	container.querySelectorAll('.edit-button').forEach(btn => {
		btn.onclick = () => editUsenetClient(btn.dataset.id);
	});
	container.querySelectorAll('.test-button').forEach(btn => {
		btn.onclick = () => testUsenetClient(btn.dataset.id, btn);
	});
}

// Edit usenet client
async function editUsenetClient(id) {
	try {
		const response = await fetch(`/api/download_clients/usenet/${id}`);
		const client = await response.json();

		if (response.status === 200) {
			document.querySelector('#edit-usenet-title-input').value = client.title;
			document.querySelector('#edit-usenet-baseurl-input').value = client.base_url;
			document.querySelector('#edit-usenet-form').action = `javascript:editUsenetClientSubmit(${id})`;
			
			const deleteBtn = document.getElementById('delete-usenet-edit');
			deleteBtn.onclick = () => deleteUsenetClient(id);
			
			const testBtn = document.getElementById('test-usenet-edit');
			testBtn.onclick = () => testUsenetClient(id, testBtn);

			hide([document.querySelector('#edit-usenet-error')]);
			showWindow('edit-usenet-window');
		}
	} catch (e) {
		console.error('Error fetching usenet client:', e);
	}
}

// Submit edit usenet client
async function editUsenetClientSubmit(id) {
	const title = document.querySelector('#edit-usenet-title-input').value;
	const baseUrl = document.querySelector('#edit-usenet-baseurl-input').value;

	try {
		const response = await fetch(`/api/download_clients/usenet/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title, base_url: baseUrl })
		});

		const result = await response.json();

		if (response.status === 200) {
			hide([document.querySelector('#edit-usenet-window')]);
			fetchUsenetClients();
		} else {
			showError('edit-usenet-error', result.message || 'Failed to update usenet client');
		}
	} catch (e) {
		console.error('Error updating usenet client:', e);
	}
}

// Delete usenet client
async function deleteUsenetClient(id) {
	if (!confirm('Are you sure you want to delete this usenet client?')) {
		return;
	}

	try {
		const response = await fetch(`/api/download_clients/usenet/${id}`, {
			method: 'DELETE'
		});

		if (response.status === 200) {
			hide([document.querySelector('#edit-usenet-window')]);
			fetchUsenetClients();
		} else {
			const result = await response.json();
			showError('edit-usenet-error', result.message || 'Failed to delete usenet client');
		}
	} catch (e) {
		console.error('Error deleting usenet client:', e);
	}
}

// Test usenet client
async function testUsenetClient(id, btn) {
	btn.className = 'test-button testing';
	btn.disabled = true;

	try {
		const response = await fetch(`/api/download_clients/usenet/${id}/test`, {
			method: 'POST'
		});

		if (response.status === 200) {
			btn.className = 'test-button success';
		} else {
			const result = await response.json();
			btn.className = 'test-button failed';
			btn.querySelector('div').textContent = result.message || 'Test failed';
		}
	} catch (e) {
		btn.className = 'test-button failed';
		console.error('Error testing usenet client:', e);
	} finally {
		setTimeout(() => {
			btn.className = 'test-button';
			btn.disabled = false;
		}, 3000);
	}
}

// Add usenet client
async function addUsenetClient() {
	const title = document.querySelector('#add-usenet-title-input').value;
	const baseUrl = document.querySelector('#add-usenet-baseurl-input').value;

	try {
		const response = await fetch('/api/download_clients/usenet', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title, base_url: baseUrl })
		});

		const result = await response.json();

		if (response.status === 200) {
			hide([document.querySelector('#add-usenet-window')]);
			fetchUsenetClients();
		} else {
			showError('add-usenet-error', result.message || 'Failed to add usenet client');
		}
	} catch (e) {
		console.error('Error adding usenet client:', e);
	}
}

// Event listeners for usenet client forms
document.addEventListener('DOMContentLoaded', () => {
	const addUsenetForm = document.getElementById('add-usenet-form');
	if (addUsenetForm) {
		addUsenetForm.action = 'javascript:addUsenetClient()';
	}

	const addUsenetBtn = document.getElementById('test-usenet-add');
	if (addUsenetBtn) {
		addUsenetBtn.onclick = () => {
			const title = document.querySelector('#add-usenet-title-input').value;
			const baseUrl = document.querySelector('#add-usenet-baseurl-input').value;
			if (title && baseUrl) {
				addUsenetClient();
			}
		};
	}
});

// Fetch usenet clients when the download clients tab is shown
const originalShowTab = window.showTab;
if (originalShowTab) {
	window.showTab = function(tabId) {
		if (tabId === 'download-clients') {
			fetchUsenetClients();
		}
		return originalShowTab(tabId);
	};
}

// Add usenet client button handler
document.addEventListener('DOMContentLoaded', () => {
	const addUsenetBtn = document.getElementById('add-usenet-client');
	if (addUsenetBtn) {
		addUsenetBtn.onclick = () => {
			document.querySelector('#add-usenet-title-input').value = '';
			document.querySelector('#add-usenet-baseurl-input').value = '';
			hide([document.querySelector('#add-usenet-error')]);
			showWindow('add-usenet-window');
		};
	}
});

// endregion
