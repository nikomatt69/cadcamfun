import React, { useState } from 'react';

const SimpleWaitlist = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus('success');
        setMessage(data.message || 'Grazie per esserti iscritto alla nostra waitlist!');
        setEmail('');
      } else {
        setStatus('error');
        setMessage(data.message || 'Si è verificato un errore. Riprova più tardi.');
      }
    } catch (error) {
      setStatus('error');
      setMessage('Si è verificato un errore. Riprova più tardi.');
      console.error('Errore:', error);
    }
  };
  
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
        Unisciti alla Waitlist
      </h2>
      
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Registrati per essere tra i primi a provare la nostra applicazione.
      </p>
      
      {status === 'success' ? (
        <div className="p-4 bg-green-100 text-green-800 rounded-md">
          {message}
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Il tuo indirizzo email"
              className="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              required
            />
            
            <button
              type="submit"
              disabled={status === 'loading'}
              className={`px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                status === 'loading' ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {status === 'loading' ? 'Invio...' : 'Iscriviti'}
            </button>
          </div>
          
          {status === 'error' && (
            <p className="mt-2 text-red-600">{message}</p>
          )}
        </form>
      )}
    </div>
  );
};

export default SimpleWaitlist;