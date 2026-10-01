import { Locale } from './types';

export type ChangeKind = 'added' | 'improved' | 'fixed' | 'removed';

export interface LocalizedText {
  'en-US': string;
  'en-GB'?: string;
  uk: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title?: LocalizedText;
  highlight?: LocalizedText;
  changes: { kind: ChangeKind; text: LocalizedText }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2',
    date: '2026-09-29',
    title: {
      'en-US': 'Megu FastCut 1.0.2 Release',
      uk: 'Реліз Megu FastCut 1.0.2',
    },
    highlight: {
      'en-US': 'Per-clip video speed regulator from 0.01x to 999x with real-time preview and synchronized audio tempo.',
      uk: 'Регулятор швидкості відео для кожного кліпу від 0.01x до 999x з живим переглядом та синхронним темпом аудіо.',
    },
    changes: [
      {
        kind: 'added',
        text: {
          'en-US': 'Independent per-clip speed slider with wide range from 0.01x ultra slow-motion up to 999x timelapse.',
          uk: 'Індивідуальний повзунок швидкості для кожного кліпу в діапазоні від 0.01x уповільнення до 999x таймлапсу.',
        },
      },
      {
        kind: 'added',
        text: {
          'en-US': 'Quick speed presets (0.25x, 0.5x, 1x, 2x, 4x, 8x), precise numeric input, and instant 1.0x reset.',
          uk: 'Швидкі пресети швидкості (0.25x, 0.5x, 1x, 2x, 4x, 8x), точне числове введення та миттєве скидання до 1.0x.',
        },
      },
      {
        kind: 'improved',
        text: {
          'en-US': 'Timeline canvas, timecode calculations, and export filtergraph accurately scale to each clip\'s speed.',
          uk: 'Таймлайн, таймкоди та граф фільтрів експорту точно масштабуються під швидкість кожного окремого кліпу.',
        },
      },
      {
        kind: 'improved',
        text: {
          'en-US': 'Synchronized audio tempo scaling via chained atempo filters across extreme speed ranges.',
          uk: 'Синхронне масштабування темпу звуку через ланцюжки фільтрів atempo навіть на екстремальних швидкостях.',
        },
      },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-09-20',
    title: {
      'en-US': 'Megu FastCut 1.0.1 Release',
      uk: 'Реліз Megu FastCut 1.0.1',
    },
    highlight: {
      'en-US': 'Windows Explorer context menu integration, instant video launching, and window close improvements.',
      uk: 'Інтеграція в контекстне меню Проводника Windows, миттєвий запуск відео та поліпшення закриття вікна.',
    },
    changes: [
      {
        kind: 'added',
        text: {
          'en-US': 'Windows Explorer context menu integration: open and edit any video format directly from right-click.',
          uk: 'Інтеграція в контекстне меню Проводника: відкриття та редагування будь-якого відеофайлу по правому кліку.',
        },
      },
      {
        kind: 'added',
        text: {
          'en-US': 'Settings controls to dynamically add or remove context menu integration at any time.',
          uk: 'Кнопки в налаштуваннях для швидкого додавання або видалення інтеграції з контекстного меню.',
        },
      },
      {
        kind: 'fixed',
        text: {
          'en-US': 'Clean window closing and instant process termination with zero orphaned processes in Task Manager.',
          uk: 'Коректне закриття вікна та миттєве завершення процесу без залишкових процесів у диспетчері завдань.',
        },
      },
      {
        kind: 'fixed',
        text: {
          'en-US': 'Eliminated unintended preview blur overlay when viewing original video aspect ratios.',
          uk: 'Виправлено небажане розмиття фону в плеєрі під час перегляду відео в оригінальних пропорціях.',
        },
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-16',
    title: {
      'en-US': 'Welcome to Megu FastCut 1.0.0',
      uk: 'Ласкаво просимо до Megu FastCut 1.0.0',
    },
    highlight: {
      'en-US': 'High-speed desktop video trimmer with lossless copy mode, smart GOP cut, and custom aspect ratio framing.',
      uk: 'Високошвидкісний відеоредактор із режимом безвтратного копіювання, точним smart cut та кадруванням під будь-які пропорції.',
    },
    changes: [
      {
        kind: 'added',
        text: {
          'en-US': 'Fast lossless trimming (-c copy) and smart GOP cut for instant exports.',
          uk: 'Швидке безвтратне обрізання (-c copy) та точний smart-cut по ключових кадрах.',
        },
      },
      {
        kind: 'added',
        text: {
          'en-US': 'Multi-clip single track sequence with seamless preview switching.',
          uk: 'Послідовність кількох кліпів на одній доріжці з безшовним перемиканням у плеєрі.',
        },
      },
      {
        kind: 'added',
        text: {
          'en-US': 'Aspect ratio framing presets (9:16, 16:9, 1:1, 4:5) with real-time crop, blur background, and stretch.',
          uk: 'Пресетні пропорції (9:16, 16:9, 1:1, 4:5) з інтерактивною рамкою, розмитим фоном та вписуванням.',
        },
      },
      {
        kind: 'added',
        text: {
          'en-US': 'Safe "Replace Current Video" workflow protecting original files in the Windows Recycle Bin with 10s undo.',
          'en-GB': 'Safe "Replace Current Video" workflow protecting original files in the Windows Recycle Bin with 10s undo behaviour.',
          uk: 'Безпечна заміна вихідного файлу через Кошик Windows з 10-секундною можливістю скасування.',
        },
      },
      {
        kind: 'added',
        text: {
          'en-US': '5 interface themes: Dark, Snow, Blackout, Rose, and dynamic RGB.',
          'en-GB': '5 interface themes: Dark, Snow, Blackout, Rose, and dynamic RGB colour cycle.',
          uk: '5 тем інтерфейсу: Dark, Snow, Blackout, Rose та динамічна RGB.',
        },
      },
      {
        kind: 'improved',
        text: {
          'en-US': 'Smooth 60 FPS timeline scrubbing with hardware-accelerated WebView2 playback.',
          uk: 'Плавний скраббінг 60 FPS на Canvas з апаратним декодуванням у WebView2.',
        },
      },
    ],
  },
];

export function resolve(text: LocalizedText, locale: Locale): string {
  if (locale === 'uk') return text.uk;
  if (locale === 'en-GB') return text['en-GB'] ?? text['en-US'];
  return text['en-US'];
}
