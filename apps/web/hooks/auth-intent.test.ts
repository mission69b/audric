/**
 * [S.123 v0.55.x] Unit tests for the pre-LLM auth intent classifier.
 *
 * Goal: prove the regex anchors correctly — lone commands match, but
 * natural-language sentences containing the same words DON'T match
 * (those route to the LLM as normal).
 *
 * The regression we're guarding against: the LLM hallucinating a
 * "you're logged out" response without actually clearing the zkLogin
 * session. See S.123 in audric-build-tracker.md for the Teo / Mysten
 * Labs bug report.
 */
import { describe, it, expect } from 'vitest';
import { detectAuthIntent } from './auth-intent';

describe('detectAuthIntent', () => {
  describe('logout intent (lone commands match)', () => {
    const logoutVariants = [
      'logout',
      'log out',
      'Logout',
      'LOG OUT',
      'sign out',
      'signout',
      'SignOut',
      '/logout',
      '/log out',
      '/sign out',
      'exit',
      'quit',
      '  logout  ',
      '\nlogout\n',
    ];

    it.each(logoutVariants)('matches %j as logout', (text) => {
      expect(detectAuthIntent(text)).toEqual({ type: 'logout' });
    });
  });

  describe('login intent (lone commands match)', () => {
    const loginVariants = [
      'login',
      'log in',
      'Login',
      'LOG IN',
      'sign in',
      'signin',
      'SignIn',
      '/login',
      '/log in',
      '/sign in',
      '  login  ',
    ];

    it.each(loginVariants)('matches %j as login', (text) => {
      expect(detectAuthIntent(text)).toEqual({ type: 'login' });
    });
  });

  describe('natural-language sentences DO NOT match (routes to LLM normally)', () => {
    const nonMatches = [
      'actually I want to log out tomorrow',
      'how do I logout?',
      'can you log me out',
      'log me out please',
      'I need to sign out of my old account',
      'where is the logout button',
      'tell me about login security',
      'why does logout not work',
      'can I sign in with another account',
      'help me log in',
      'logout the dog from the app', // pathological case — still natural language
      'is logout safe',
    ];

    it.each(nonMatches)('does NOT match %j', (text) => {
      expect(detectAuthIntent(text)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null for empty / whitespace-only strings', () => {
      expect(detectAuthIntent('')).toBeNull();
      expect(detectAuthIntent('   ')).toBeNull();
      expect(detectAuthIntent('\n\t')).toBeNull();
    });

    it('returns null for chip / tool-related text that contains substrings', () => {
      expect(detectAuthIntent('save')).toBeNull();
      expect(detectAuthIntent('check balance')).toBeNull();
      expect(detectAuthIntent('swap to USDC')).toBeNull();
    });

    it('returns null for non-auth verbs that look similar', () => {
      expect(detectAuthIntent('logger')).toBeNull();
      expect(detectAuthIntent('signing my life away')).toBeNull();
      expect(detectAuthIntent('exiting mode')).toBeNull();
    });
  });
});
