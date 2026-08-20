// Smooth scroll to upload section
function scrollToUpload() {
  const uploadSection = document.getElementById('uploadSection');
  uploadSection.scrollIntoView({ behavior: 'smooth' });
}

// Drag and drop handlers
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    processFile(e.dataTransfer.files[0]);
  }
}

function handleFileSelect(e) {
  if (e.target.files && e.target.files.length > 0) {
    processFile(e.target.files[0]);
  }
}

function processFile(file) {
  const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  if (!validTypes.includes(file.type)) {
    alert('Please upload a supported PDF, JPG, JPEG, or PNG file.');
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    alert('File size exceeds the 25MB limit.');
    return;
  }

  document.getElementById('trayFileName').innerText = file.name;
  const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
  const ext = file.name.split('.').pop().toUpperCase();
  document.getElementById('trayFileSize').innerText = `${ext} • ${sizeMb} MB`;
  document.getElementById('trayFileIcon').innerText = ext === 'PDF' ? '📄' : '🖼️';
  
  document.getElementById('fileTray').style.display = 'flex';
}

function removeSelectedFile() {
  document.getElementById('fileTray').style.display = 'none';
  document.getElementById('fileInput').value = '';
}

// Processing Timeline Animation (Frontend Demo Simulation)
function startReportProcessing() {
  document.getElementById('fileTray').style.display = 'none';
  const statusCard = document.getElementById('processingStatusCard');
  statusCard.style.display = 'block';
  statusCard.scrollIntoView({ behavior: 'smooth' });

  setTimeout(() => {
    document.getElementById('stepOcr').classList.remove('active');
    document.getElementById('stepOcr').classList.add('completed');
    document.getElementById('stepOcr').querySelector('.step-circle').innerText = '✓';
    document.getElementById('stepExtract').classList.add('active');
    document.getElementById('loadingText').innerText = 'Extracting structured medical values...';
  }, 1500);

  setTimeout(() => {
    document.getElementById('stepExtract').classList.remove('active');
    document.getElementById('stepExtract').classList.add('completed');
    document.getElementById('stepExtract').querySelector('.step-circle').innerText = '✓';
    document.getElementById('stepAi').classList.add('active');
    document.getElementById('loadingText').innerText = 'Generating AI-assisted explanation summary...';
  }, 3000);

  setTimeout(() => {
    document.getElementById('stepAi').classList.remove('active');
    document.getElementById('stepAi').classList.add('completed');
    document.getElementById('stepAi').querySelector('.step-circle').innerText = '✓';
    document.getElementById('stepReady').classList.add('completed');
    document.getElementById('stepReady').querySelector('.step-circle').innerText = '✓';
    document.getElementById('loadingFeedback').style.display = 'none';
    
    setTimeout(() => {
      statusCard.style.display = 'none';
      openReportWorkspace('Newly Uploaded Lab Report', 'Today', 'Blood Test');
    }, 600);
  }, 4500);
}

// Workspace Management
function openReportWorkspace(reportName, reportDate, reportType) {
  document.getElementById('activeReportTitle').innerText = reportName;
  document.getElementById('previewDocName').innerText = `${reportName.replace(/\s+/g, '_')}.pdf`;
  const workspace = document.getElementById('reportWorkspace');
  workspace.style.display = 'block';
  workspace.scrollIntoView({ behavior: 'smooth' });
}

function closeWorkspace() {
  document.getElementById('reportWorkspace').style.display = 'none';
}

function openFullscreenPreview() {
  alert('Opening interactive document preview mode...');
}

// Edit Modal Handling
let activeEditRowId = null;

function openEditModal(testName, result, unit, range) {
  activeEditRowId = testName;
  document.getElementById('editTestName').value = testName;
  document.getElementById('editTestResult').value = result;
  document.getElementById('editTestUnit').value = unit;
  document.getElementById('editTestRange').value = range;
  document.getElementById('editResultError').innerText = '';
  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  activeEditRowId = null;
}

function saveEditedData(e) {
  e.preventDefault();
  const newResult = document.getElementById('editTestResult').value.trim();
  if (!newResult) {
    document.getElementById('editResultError').innerText = 'Result value cannot be empty.';
    return;
  }

  // Update DOM dynamically for frontend feedback
  if (activeEditRowId === 'Hemoglobin') {
    document.getElementById('val-hb').innerHTML = `<strong>${newResult}</strong> <span style="font-size:0.7rem; color:var(--success-green); font-weight:700;">(Edited)</span>`;
  } else if (activeEditRowId === 'WBC Count') {
    document.getElementById('val-wbc').innerHTML = `<strong>${newResult}</strong> <span style="font-size:0.7rem; color:var(--success-green); font-weight:700;">(Edited)</span>`;
  } else if (activeEditRowId === 'Platelets') {
    document.getElementById('val-plt').innerHTML = `<strong>${newResult}</strong> <span style="font-size:0.7rem; color:var(--success-green); font-weight:700;">(Edited)</span>`;
  }

  closeEditModal();
  showToast('Information updated successfully.');
}

// Delete Confirmation Modal
function openDeleteModal() {
  document.getElementById('deleteModal').style.display = 'flex';
}

function closeDeleteModal() {
  document.getElementById('deleteModal').style.display = 'none';
}

function executeDelete() {
  closeDeleteModal();
  closeWorkspace();
  showToast('Report deleted successfully.');
}

// Full Extracted Text Modal
function toggleFullTextModal() {
  const modal = document.getElementById('fullTextModal');
  modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function copyRawText() {
  const rawText = document.getElementById('rawOcrPreContent').innerText;
  navigator.clipboard.writeText(rawText).then(() => {
    showToast('Extracted text copied to clipboard!');
  });
}

// Toast Notification Helper
function showToast(message) {
  const toast = document.getElementById('toastNotification');
  document.getElementById('toastMessage').innerText = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}

// Search and Filter History
function filterReportHistory() {
  const query = document.getElementById('reportSearchInput').value.toLowerCase();
  const filterType = document.getElementById('reportFilterSelect').value;
  const cards = document.getElementsByClassName('history-card');

  for (let card of cards) {
    const text = card.innerText.toLowerCase();
    const matchesSearch = text.includes(query);
    let matchesFilter = true;

    if (filterType === 'blood' && !text.includes('blood')) matchesFilter = false;
    if (filterType === 'cbc' && !text.includes('cbc')) matchesFilter = false;
    if (filterType === 'prescription' && !text.includes('prescription')) matchesFilter = false;
    if (filterType === 'diagnostic' && !text.includes('diagnostic')) matchesFilter = false;

    card.style.display = (matchesSearch && matchesFilter) ? 'flex' : 'none';
  }
}