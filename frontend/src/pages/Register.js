import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;

function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Registration failed');
      const data = await res.json();
      localStorage.setItem('token', data.token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Register</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <input
        type='text'
        name='username'
        onChange={(e) => setForm({ ...form, username: e.target.value })}
        required
      />
      <input
        type='email'
        name='email'
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        required
      />
      <input
        type='password'
        name='password'
        onChange={(e) => setForm({ ...form, password: e.target.value })}
        required
      />
      <button type='submit'>Register</button>
    </form>
  );
}

export default Register;
