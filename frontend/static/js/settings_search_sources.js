// -*- coding: utf-8 -*-
// Settings - Search Sources

// Fetch and display Prowlarr clients
async function fetchProwlarrClients() {
	try {
		const response = await fetch('/api/search_sources/prowlarr');
		const result = await response.json();

		if (response.status === 200) {
			displayProwlarrClients(result);
		} else {
			console.error('Failed to fetch Prowlarr clients:', result);
		}
	} catch (e) {
		console.error('Error fetching Prowlarr clients:', e);
	}
}

// Display Prowlarr clients in the list
function displayProwlarrClients(clients) {
	const container = document.getElementById('prowlarr-client-list');
	if (!container) return;

	container.innerHTML = '';

	if (clients.length === 0) {
		const emptyMsg = document.createElement('p');
		emptyMsg.textContent = 'No Prowlarr clients configured.';
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
		btn.onclick = () => editProwlarrClient(btn.dataset.id);
	});
	container.querySelectorAll('.test-button').forEach(btn => {
		btn.onclick = () => testProwlarrClient(btn.dataset.id, btn);
	});
}

// Edit Prowlarr client
async function editProwlarrClient(id) {
	try {
		const response = await fetch(`/api/search_sources/prowlarr/${id}`);
		const client = await response.json();

		if (response.status === 200) {
			document.querySelector('#edit-prowlarr-title-input').value = client.title;
			document.querySelector('#edit-prowlarr-baseurl-input').value = client.base_url;
			document.querySelector('#edit-prowlarr-apikey-input').value = client.api_key;
			document.querySelector('#edit-prowlarr-form').action = `javascript:editProwlarrClientSubmit(${id})`;
			
			const deleteBtn = document.getElementById('delete-prowlarr-edit');
			deleteBtn.onclick = () => deleteProwlarrClient(id);
			
			const testBtn = document.getElementById('test-prowlarr-edit');
			testBtn.onclick = () => testProwlarrClient(id, testBtn);

			showWindow('edit-prowlarr-window');
		}
	} catch (e) {
		console.error('Error fetching Prowlarr client:', e);
	}
}

// Submit edit Prowlarr client
async function editProwlarrClientSubmit(id) {
	const title = document.querySelector('#edit-prowlarr-title-input').value;
	const baseUrl = document.querySelector('#edit-prowlarr-baseurl-input').value;
	const apiKey = document.querySelector('#edit-prowlarr-apikey-input').value;

	try {
		const response = await fetch(`/api/search_sources/prowlarr/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title, base_url: baseUrl, api_key: apiKey })
		});

		const result = await response.json();

		if (response.status === 200) {
			hide([document.querySelector('#edit-prowlarr-window')]);
			fetchProwlarrClients();
		} else {
			showError('edit-prowlarr-error', result.message || 'Failed to update Prowlarr client');
		}
	} catch (e) {
		console.error('Error updating Prowlarr client:', e);
	}
}

// Delete Prowlarr client
async function deleteProwlarrClient(id) {
	if (!confirm('Are you sure you want to delete this Prowlarr client?')) {
		return;
	}

	try {
		const response = await fetch(`/api/search_sources/prowlarr/${id}`, {
			method: 'DELETE'
		});

		if (response.status === 200) {
			hide([document.querySelector('#edit-prowlarr-window')]);
			fetchProwlarrClients();
		} else {
			const result = await response.json();
			showError('edit-prowlarr-error', result.message || 'Failed to delete Prowlarr client');
		}
	} catch (e) {
		console.error('Error deleting Prowlarr client:', e);
	}
}

// Test Prowlarr client
async function testProwlarrClient(id, btn) {
	btn.className = 'test-button testing';
	btn.disabled = true;

	try {
		const response = await fetch(`/api/search_sources/prowlarr/${id}/test`, {
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
		console.error('Error testing Prowlarr client:', e);
	} finally {
		setTimeout(() => {
			btn.className = 'test-button';
			btn.disabled = false;
		}, 3000);
	}
}

// Add Prowlarr client
async function addProwlarrClient() {
	const title = document.querySelector('#add-prowlarr-title-input').value;
	const baseUrl = document.querySelector('#add-prowlarr-baseurl-input').value;
	const apiKey = document.querySelector('#add-prowlarr-apikey-input').value;

	try {
		const response = await fetch('/api/search_sources/prowlarr', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title, base_url: baseUrl, api_key: apiKey })
		});

		const result = await response.json();

		if (response.status === 200) {
			hide([document.querySelector('#add-prowlarr-window')]);
			fetchProwlarrClients();
		} else {
			showError('add-prowlarr-error', result.message || 'Failed to add Prowlarr client');
		}
	} catch (e) {
		console.error('Error adding Prowlarr client:', e);
	}
}

// Event listeners for Prowlarr client forms
document.addEventListener('DOMContentLoaded', () => {
	const addProwlarrForm = document.getElementById('add-prowlarr-form');
	if (addProwlarrForm) {
		addProwlarrForm.action = 'javascript:addProwlarrClient()';
	}

	// Add Prowlarr client button handler
	const addProwlarrBtn = document.getElementById('add-prowlarr-client');
	if (addProwlarrBtn) {
		addProwlarrBtn.onclick = () => {
			document.querySelector('#add-prowlarr-title-input').value = '';
			document.querySelector('#add-prowlarr-baseurl-input').value = '';
			document.querySelector('#add-prowlarr-apikey-input').value = '';
			hide([document.querySelector('#add-prowlarr-error')]);
			showWindow('add-prowlarr-window');
		};
	}
});
