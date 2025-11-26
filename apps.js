<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MyTube: Онлайн Видеохостинг (Enhanced Mac-Vibe)</title>
    <!-- Шрифт Inter для чистоты дизайна -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
    <!-- Tailwind CSS CDN для стильного дизайна -->
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        /* Стиль для эффекта "матового стекла" (Glassmorphism) */
        .glass-card {
            /* Усиленный эффект стекла */
            background-color: rgba(255, 255, 255, 0.08); /* Меньше прозрачности */
            backdrop-filter: blur(15px); /* Сильнее размытие */
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 10px 30px 0 rgba(0, 0, 0, 0.2); /* Более глубокая тень */
        }
        /* Усиленный фиолетовый градиентный фон для "вайба" */
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #4c1d95 40%, #8b5cf6 100%); /* Более насыщенный градиент */
            min-height: 100vh;
        }
        .text-mac-lilac { color: #D8BFD8; }
        .btn-lilac { background-color: #a78bfa; transition: all 0.3s; }
        .btn-lilac:hover { background-color: #8b5cf6; }

        /* Кастомный стиль для видео, чтобы выглядело аккуратно */
        .video-card video {
            width: 100%;
            aspect-ratio: 16 / 9;
            object-fit: cover;
            border-radius: 6px;
            background-color: #000;
        }

        /* Стильный лоадер */
        .loader { 
            border: 4px solid #475569; /* Серый цвет */
            border-top: 4px solid #a78bfa; /* Фиолетовый цвет */
            border-radius: 50%; width: 20px; height: 20px; 
            animation: spin 1s linear infinite; 
            display: inline-block; /* Для красивого расположения */
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body class="p-4 sm:p-8 text-white">

    <div class="max-w-6xl mx-auto">
        
        <!-- HEADER и АУТЕНТИФИКАЦИЯ -->
        <header class="flex flex-col sm:flex-row justify-between items-center py-4 mb-8 glass-card rounded-2xl p-6">
            <h1 class="text-3xl font-extrabold text-white mb-4 sm:mb-0">
                <span class="text-red-500 text-4xl mr-2">▶</span> MyTube <span class="text-mac-lilac text-lg font-light hidden sm:inline">| Cloud Video Platform</span>
            </h1>
            <div id="auth-status" class="flex items-center space-x-3">
                <span id="user-info" class="text-sm font-semibold text-gray-300"></span>
                <button id="google-login-btn" class="btn-lilac text-white font-medium py-2 px-4 rounded-xl shadow-lg transition transform hover:scale-105">
                    Войти через Google
                </button>
                <button id="logout-btn" class="bg-gray-700 text-white font-medium py-2 px-4 rounded-xl shadow-md hover:bg-gray-600 transition hidden">
                    Выйти
                </button>
            </div>
        </header>

        <!-- РАЗДЕЛ ЗАГРУЗКИ ВИДЕО -->
        <section id="upload-section" class="mb-10 glass-card rounded-2xl p-6 hidden">
            <h2 class="text-2xl font-semibold mb-4 text-mac-lilac">Загрузить видео</h2>
            <div class="flex flex-col md:flex-row md:space-x-4 space-y-4 md:space-y-0">
                <input type="text" id="video-title" placeholder="Введите заголовок видео (обязательно)" 
                       class="flex-grow p-3 bg-white/20 text-white placeholder-gray-300 border border-white/20 rounded-xl focus:ring-2 focus:ring-mac-lilac focus:outline-none">
                
                <button id="upload-widget" class="btn-lilac text-white font-bold py-3 px-6 rounded-xl shadow-2xl transition transform hover:scale-105">
                    Выбрать и Загрузить Файл (MP4, MOV)
                </button>
            </div>
            <div class="flex items-center mt-4 space-x-3">
                <div id="upload-loader" class="loader hidden"></div>
                <p id="upload-status" class="text-sm text-yellow-300"></p>
            </div>
        </section>

        <!-- ГАЛЕРЕЯ ВИДЕО -->
        <section>
            <h2 class="text-2xl font-bold mb-6 text-white">Последние публикации</h2>
            <div id="video-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <p class="text-center col-span-full text-gray-400">Загрузка видео...</p>
            </div>
        </section>

        <!-- ФУТЕР -->
        <footer class="mt-16 text-center text-gray-400 text-sm">
            <p>&copy; 2025 MyTube Project | Хостинг на базе Cloudinary & Firebase</p>
        </footer>
        
    </div>

    <!-- Firebase SDKs -->
    <script src="https://www.gstatic.com/firebasejs/8.6.8/firebase-app.js"></script>
    <script src="https://www.gstatic.com/firebasejs/8.6.8/firebase-auth.js"></script>
    <script src="https://www.gstatic.com/firebasejs/8.6.8/firebase-firestore.js"></script>
    <!-- Cloudinary Widget -->
    <script src="https://upload-widget.cloudinary.com/global/all.js"></script>

    <script>
        // =======================================================================
        // 1. КОНФИГУРАЦИЯ FIREBASE (ИСПОЛЬЗУЕТСЯ ВАША)
        // =======================================================================
        const firebaseConfig = {
            apiKey: "AIzaSyAFnfowA8SHb6URsGIJjTGMLuK2dnYlK3A",
            authDomain: "mytube-2b490.firebaseapp.com",
            projectId: "mytube-2b490",
            storageBucket: "mytube-2b490.firebasestorage.app",
            messagingSenderId: "778338590908",
            appId: "1:778338590908:web:b99e243c7d663f0ee030b9",
            measurementId: "G-JJWNPEWGK2"
        };
        
        // =======================================================================
        // 2. КОНФИГУРАЦИЯ CLOUDINARY (ЗАМЕНИТЕ ЭТИ ДВА ПОЛЯ!)
        // =======================================================================
        const CLOUDINARY_CONFIG = {
            cloudName: "ВАШ_CLOUD_NAME_СЮДА", 
            uploadPreset: "ВАШ_PRESET_NAME_СЮДА" 
        };
        // =======================================================================

        // Инициализация Firebase
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        const db = firebase.firestore();
        
        // --- Элементы UI ---
        const loginBtn = document.getElementById('google-login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const userInfo = document.getElementById('user-info');
        const uploadSection = document.getElementById('upload-section');
        const videoTitleInput = document.getElementById('video-title');
        const uploadStatus = document.getElementById('upload-status');
        const videoGrid = document.getElementById('video-grid');
        const uploadLoader = document.getElementById('upload-loader');


        // --- 3. АВТОРИЗАЦИЯ ---
        loginBtn.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(error => {
                uploadStatus.textContent = `Ошибка входа: ${error.message}`;
            });
        });

        logoutBtn.addEventListener('click', () => {
            auth.signOut();
        });

        // Отслеживание статуса авторизации в реальном времени
        // 🚨 ВАЖНО: Проверку IP-адреса или устройства НЕЛЬЗЯ надежно реализовать
        // в клиентском коде JavaScript. Для безопасности используйте только 
        // стандартные механизмы Firebase (Authentication и Security Rules).
        auth.onAuthStateChanged(user => {
            if (user) {
                // Разбиваем имя по пробелу и берем первое слово (имя)
                userInfo.textContent = `Привет, ${user.displayName.split(' ')[0]}!`; 
                loginBtn.classList.add('hidden');
                logoutBtn.classList.remove('hidden');
                uploadSection.classList.remove('hidden');
            } else {
                userInfo.textContent = 'Войдите, чтобы загружать видео.';
                loginBtn.classList.remove('hidden');
                logoutBtn.classList.add('hidden');
                uploadSection.classList.add('hidden');
            }
        });


        // --- 4. ЗАГРУЗКА ВИДЕО (Cloudinary + Firestore) ---
        const uploadWidget = cloudinary.createUploadWidget({
            cloudName: CLOUDINARY_CONFIG.cloudName, 
            uploadPreset: CLOUDINARY_CONFIG.uploadPreset,
            resourceType: "video", 
            clientAllowedFormats: ["mp4", "mov", "avi"],
            maxFileSize: 100000000 // 100 МБ
        }, (error, result) => { 
            uploadLoader.classList.add('hidden'); 
            
            if (!error && result && result.event === "success") { 
                const user = auth.currentUser;
                const title = videoTitleInput.value.trim();

                if (!title) {
                    uploadStatus.textContent = '❌ Ошибка: Введите заголовок видео!';
                    return;
                }
                
                // 4.1. Сохранение метаданных в Firestore
                db.collection("videos").add({
                    title: title,
                    url: result.info.secure_url, 
                    author: user.displayName,
                    author_uid: user.uid,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                })
                .then(() => {
                    uploadStatus.textContent = `✅ Видео "${title}" успешно опубликовано!`;
                    videoTitleInput.value = ''; // Очистка поля
                })
                .catch(e => {
                    console.error("Firestore Error:", e);
                    uploadStatus.textContent = `❌ Ошибка БД: ${e.message}`;
                });
            } else if (error) {
                 uploadStatus.textContent = `❌ Ошибка загрузки: ${error.message}`;
            }
        });

        document.getElementById("upload-widget").addEventListener("click", function(){
            if (!auth.currentUser) {
                uploadStatus.textContent = "Пожалуйста, войдите через Google!";
                return;
            }
            if (!videoTitleInput.value.trim()) {
                uploadStatus.textContent = "Введите заголовок перед загрузкой.";
                return;
            }

            uploadStatus.textContent = 'Открытие окна загрузки. Не закрывайте его!';
            uploadLoader.classList.remove('hidden');
            uploadWidget.open();
        });


        // --- 5. ЗАГРУЗКА ГАЛЕРЕИ В РЕАЛЬНОМ ВРЕМЕНИ (onSnapshot) ---
        function renderVideos(snapshot) {
            videoGrid.innerHTML = '';
            
            if (snapshot.empty) {
                videoGrid.innerHTML = '<p class="text-center col-span-full text-gray-400">Видео пока нет. Загрузите первое!</p>';
                return;
            }

            snapshot.forEach(doc => {
                const video = doc.data();
                const card = document.createElement('div');
                card.className = 'video-card glass-card p-4 rounded-xl transition transform hover:scale-[1.02] hover:shadow-2xl cursor-pointer'; // Добавлен ховер-эффект
                
                const date = video.timestamp ? 
                             video.timestamp.toDate().toLocaleDateString('ru-RU') : 
                             '—';

                card.innerHTML = `
                    <video controls class="w-full">
                        <source src="${video.url}" type="video/mp4">
                        Ваш браузер не поддерживает видео.
                    </video>
                    <h3 class="text-lg font-semibold mt-2 text-white">${video.title}</h3>
                    <p class="text-sm text-gray-300">Автор: <span class="text-mac-lilac">${video.author || 'Аноним'}</span></p>
                    <p class="text-xs text-gray-400">Опубликовано: ${date}</p>
                `;
                videoGrid.appendChild(card);
            });
        }

        // Подписываемся на изменения в базе данных (галерея обновляется сама)
        db.collection("videos").orderBy("timestamp", "desc").limit(15).onSnapshot(
            (snapshot) => {
                renderVideos(snapshot);
            }, 
            (error) => {
                console.error("Error fetching videos:", error);
                videoGrid.innerHTML = `<p class="text-center col-span-full text-red-400">Ошибка подключения к базе данных: ${error.message}</p>`;
            }
        );
    </script>
</body>
</html>
