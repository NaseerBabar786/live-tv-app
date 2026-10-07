// Signing in, as on the TV (SignInScreen): a code to approve at google.com/device on a phone, or an
// email and password (sign in, create an account, forgot password).
import { h, button } from '../dom.js';
import * as nav from '../nav.js';
import * as account from '../account.js';

export function openSignIn(onDone) {
  const root = h('div.signin');
  document.getElementById('app').appendChild(root);
  let closed = false;
  let gen = 0;
  let pop = () => {};

  function done() {
    closed = true;
    gen++;
    pop();
    root.remove();
    onDone && onDone();
  }

  function google() {
    root.innerHTML = '';
    const status = h('p.muted', 'Getting a code…');
    const code = h('div.code', '');
    const where = h('p', '');
    const emailBtn = button('Use email and password instead', () => email());
    root.append(h('img.logo.big', { src: 'logo.svg', alt: '' }), h('h1', 'Sign in to Cable TV'),
      h('p', 'Cable TV is free. Sign in once with your Google account:'), where, code, status, emailBtn);
    if (account.notice()) root.appendChild(h('p.notice', account.notice()));
    nav.focus(emailBtn);
    const my = ++gen;
    const cancelled = () => closed || my !== gen;
    (async () => {
      try {
        const c = await account.startGoogle();
        if (cancelled()) return;
        where.innerHTML = '';
        where.append('On your phone or this PC, open ', h('a', { href: '#', on: { click: (e) => { e.preventDefault(); window.pc?.openExternal(c.url); } } }, c.url.replace(/^https?:\/\//, '')), ' and type this code:');
        code.textContent = c.userCode;
        status.textContent = 'Waiting for you to approve it…';
        await account.awaitGoogle(c, cancelled);
        if (!cancelled()) done();
      } catch (e) {
        if (cancelled() || e.message === 'cancelled') return;
        status.textContent = e.message || 'Something went wrong. Try again.';
        const again = button('Get a new code', google);
        root.insertBefore(again, emailBtn);
        nav.focus(again);
      }
    })();
  }

  function email(mode = 'in') {
    gen++;
    root.innerHTML = '';
    const name = h('input.field', { type: 'text', placeholder: 'Your name', 'data-focus': '' });
    const mail = h('input.field', { type: 'email', placeholder: 'Email', 'data-focus': '' });
    const pass = h('input.field', { type: 'password', placeholder: 'Password (at least 6 characters)', 'data-focus': '' });
    const status = h('p.muted', '');
    const go = button(mode === 'up' ? 'Create account' : mode === 'reset' ? 'Send reset email' : 'Sign in', async () => {
      status.textContent = 'Please wait…';
      try {
        if (mode === 'up') await account.signUpWithEmail(name.value, mail.value, pass.value);
        else if (mode === 'reset') { await account.sendPasswordReset(mail.value); status.textContent = 'Check your email for a link to set a new password.'; return; }
        else await account.signInWithEmail(mail.value, pass.value);
        done();
      } catch (e) {
        status.textContent = e.message;
      }
    });
    const links = h('div.links',
      mode !== 'in' ? button('I have an account', () => email('in'), 'text') : button('Create an account', () => email('up'), 'text'),
      mode !== 'reset' ? button('Forgot password', () => email('reset'), 'text') : null,
      button('Use Google instead', google, 'text'));
    root.append(...[h('img.logo.big', { src: 'logo.svg', alt: '' }),
      h('h1', mode === 'up' ? 'Create your Cable TV account' : mode === 'reset' ? 'Forgot your password?' : 'Sign in with email'),
      mode === 'up' ? name : null, mail, mode === 'reset' ? null : pass, go, status, links].filter(Boolean));
    for (const f of [name, mail, pass]) {
      f.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go.click(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); google(); }
      });
    }
    (mode === 'up' ? name : mail).focus();
  }

  pop = nav.push(root, (key) => {
    if (key === 'back') return true;
    return false;
  });
  google();
  return { close: done };
}

