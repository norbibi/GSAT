import * as React from 'react';
import { createRoot } from 'react-dom/client';

import 'bootstrap/dist/css/bootstrap.min.css';

import { Main } from './sst.jsx'

const domNode = document.getElementById('root');
const root = createRoot(domNode);
root.render(<Main />);