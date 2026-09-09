import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './editor/monaco.setup.js';
import './index.css';

createRoot(document.getElementById('root')).render(<App />);
