import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from '../App';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByText('ParaApp')).toBeTruthy();
  });

  it('renders the subtitle', () => {
    render(<App />);
    expect(screen.getByText('Bitcoin Mining Monitor')).toBeTruthy();
  });
});
