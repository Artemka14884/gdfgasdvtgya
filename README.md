# CS2 Bomb Overlay — Инструкция по установке

## Что это

Прозрачный оверлей поверх CS2, который показывает:
- На каком плэнте заложена бомба (A или B)
- Таймер обратного отсчёта (красный когда < 15 сек)
- Статус дефуза с таймером
- Надпись "БОМБА ДЕФУЗНУТА" / "БОМБА ВЗОРВАЛАСЬ" с плавным исчезновением

Работает через официальный **Game State Integration API** от Valve — никакого чтения памяти.

---

## Шаг 1 — Установи конфиг GSI в CS2

Скопируй файл `gamestate_integration_bomb_overlay.cfg` в папку:

```
C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg\
```

---

## Шаг 2 — Собери проект

### Требования:
- **Visual Studio 2022** (с компонентом "Desktop development with C++")
- **CMake 3.20+**
- **ImGui** (скачай с https://github.com/ocornut/imgui и положи папку `imgui` рядом с `CMakeLists.txt`)

### Сборка:
```bash
mkdir build
cd build
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
```

Готовый `.exe` будет в `build/Release/CS2BombOverlay.exe`

---

## Шаг 3 — Запуск

1. Запусти **CS2**
2. Запусти **CS2BombOverlay.exe** от имени администратора
3. Зайди в игру — оверлей появится автоматически

> **Примечание для полноэкранного режима:** CS2 должен быть в режиме  
> `Полный экран (Borderless)` или `Оконный` — иначе оверлей может не отображаться поверх игры.  
> Настройка: CS2 → Настройки → Видео → Режим отображения → **Полный экран (без рамки)**

---

## Структура файлов

```
cs2_overlay/
├── main.cpp                              # Точка входа
├── gsi_server.h / gsi_server.cpp         # HTTP сервер для GSI данных
├── overlay.h / overlay.cpp               # DirectX11 + ImGui оверлей
├── bomb_info.h                           # Структура данных бомбы
├── CMakeLists.txt                        # Система сборки
├── gamestate_integration_bomb_overlay.cfg # Конфиг для CS2
└── imgui/                                # Скачай с github.com/ocornut/imgui
```

---

## Как это работает

```
CS2 → (HTTP POST на 127.0.0.1:3000) → GSI Server → BombInfo → ImGui Overlay
```

CS2 сам отправляет данные о бомбе каждые ~100мс через Game State Integration.  
Никакого чтения памяти, никаких инжектов — это официальный инструмент Valve.
"# gdfgasdvtgya" 
