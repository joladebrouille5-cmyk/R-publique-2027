import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/generated/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.wrangler/**',
      // Projet Android généré par Capacitor (contient une copie du paquet construit).
      'apps/mobile/android/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
  },

  // Moteur : pur et déterministe (§11). Aucune horloge, aucun aléa non contrôlé, aucune E/S.
  {
    files: ['packages/engine/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Moteur pur : utiliser les dates ISO de @r2027/shared.' },
        { name: 'performance', message: 'Moteur pur : pas d’horloge.' },
        { name: 'setTimeout', message: 'Moteur pur : pas de minuterie.' },
        { name: 'setInterval', message: 'Moteur pur : pas de minuterie.' },
        { name: 'fetch', message: 'Moteur pur : pas de réseau.' },
        { name: 'process', message: 'Moteur pur : pas d’environnement.' },
        { name: 'crypto', message: 'Moteur pur : utiliser core/sha256 et core/rng.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Moteur pur : utiliser core/rng.' },
      ],
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'os', 'crypto', 'http', 'https'],
              message: 'Moteur pur : pas d’E/S.',
            },
            {
              group: ['@prisma/*', 'pg', 'fastify', '@fastify/*'],
              message: 'Moteur pur : pas de base ni de serveur.',
            },
            { group: ['react', 'react-dom', 'react-*'], message: 'Moteur pur : pas d’interface.' },
            {
              group: ['@r2027/save-engine', '@r2027/api', '@r2027/web'],
              message: 'Dépendance interdite depuis le moteur.',
            },
          ],
        },
      ],
    },
  },

  // Interface : n'exécute jamais la simulation (calcul faisant foi côté serveur).
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@r2027/engine',
              message: 'Le navigateur ne calcule pas l’état.',
              allowTypeImports: true,
            },
            { name: '@r2027/save-engine', message: 'Réservé au serveur.', allowTypeImports: true },
          ],
        },
      ],
    },
  },

  // Scènes 3D (phase 26) : three.js se pilote par mutation, image après image (uniformes de
  // shaders, matrices d'instances, caméra) ; la règle d'immuabilité du compilateur React ne
  // s'applique pas à ces objets, qui ne sont pas de l'état React.
  {
    files: ['apps/web/src/scenes3d/three/**/*.{ts,tsx}'],
    rules: { 'react-hooks/immutability': 'off' },
  },

  // Application mobile : l'interface de apps/web branchée sur le moteur local (@r2027/local-api),
  // qui exécute la simulation sur l'appareil derrière le même contrat que l'API.
  {
    files: ['apps/mobile/src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },

  {
    // Les tests de l'interface fabriquent leurs états avec le vrai moteur (jamais le code livré).
    files: ['apps/web/src/test/**/*.{ts,tsx}', 'apps/web/**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
