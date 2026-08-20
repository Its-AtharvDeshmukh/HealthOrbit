function switchTab(targetTab) {
  const isLogin = targetTab === 'login';
  document.getElementById('loginForm').classList.toggle('active', isLogin);
  document.getElementById('signupForm').classList.toggle('active', !isLogin);
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabSignup').classList.toggle('active', !isLogin);
}

function setFieldError(fieldGroupId, hasError) {
  const group = document.getElementById(fieldGroupId);
  if (group) {
    group.classList.toggle('error', hasError);
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Login validation handler
document.getElementById('loginForm').addEventListener('submit', function (e) {
  e.preventDefault();
  document.getElementById('loginServerMsg').classList.remove('show');

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  const emailValid = validateEmail(email);
  const passwordValid = password.length > 0;

  setFieldError('loginEmailField', !emailValid);
  setFieldError('loginPasswordField', !passwordValid);

  if (emailValid && passwordValid) {
    this.submit();
  }
});

// Signup validation handler
document.getElementById('signupForm').addEventListener('submit', function (e) {
  e.preventDefault();
  document.getElementById('signupServerMsg').classList.remove('show');

  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirm').value;

  const nameValid = name.length > 0;
  const emailValid = validateEmail(email);
  const passwordValid = password.length >= 8 && /\d/.test(password);
  const confirmValid = password === confirm && confirm.length > 0;

  setFieldError('signupNameField', !nameValid);
  setFieldError('signupEmailField', !emailValid);
  setFieldError('signupPasswordField', !passwordValid);
  setFieldError('signupConfirmField', !confirmValid);

  if (nameValid && emailValid && passwordValid && confirmValid) {
    this.submit();
  }
});