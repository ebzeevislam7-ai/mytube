// ==========================================
// 1. НАСТРОЙКИ FIREBASE (Вставь свои ключи!)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAFnfowA8SHb6URsGIJjTGMLuK2dnYlK3A",
    authDomain: "mytube-2b490.firebaseapp.com",
    projectId: "mytube-2b490",
 storageBucket: "mytube-2b490.firebasestorage.app",
  messagingSenderId: "778338590908",
  appId: "1:778338590908:web:b99e243c7d663f0ee030b9",
  measurementId: "G-JJWNPEWGK2"

    // Добавьте остальные параметры из Firebase Console
};
// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ==========================================
// 2. НАСТРОЙКИ CLOUDINARY (Вставь свои данные!)
// ==========================================
const CLOUDINARY_CLOUD_NAME = "ТВОЕ_CLOUD_NAME"; 
const CLOUDINARY_PRESET = "ТВОЙ_PRESET_NAME";
// ==========================================


// --- 3. АВТОРИЗАЦИЯ (GOOGLE) ---

document.getElementById('google-login-btn').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider);
});

document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut();
});

// Отслеживание статуса авторизации
auth.onAuthStateChanged(user => {
    const loginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    const uploadSection = document.getElementById('upload-section');

    if (user) {
        userInfo.textContent = ` ${user.displayName}`;
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline';
        uploadSection.style.display = 'block';
    } else {
        userInfo.textContent = '';
        loginBtn.style.display = 'inline';
        logoutBtn.style.display = 'none';
        uploadSection.style.display = 'none';
    }
    loadVideos(); 
});


// --- 4. ЗАГРУЗКА ВИДЕО (Cloudinary + Firestore) ---

const uploadWidget = cloudinary.createUploadWidget({
    cloudName: CLOUDINARY_CLOUD_NAME, 
    uploadPreset: CLOUDINARY_PRESET,
    resourceType: "video", // Только видео
    clientAllowedFormats: ["mp4", "mov"],
    maxFileSize: 100000000 // 100 МБ лимит
}, (error, result) => { 
    document.getElementById('upload-loader').style.display = 'none'; // Скрываем лоадер
    
    if (!error && result && result.event === "success") { 
        const user = auth.currentUser;
        const videoTitle = document.getElementById('video-title').value || result.info.original_filename.split('.')[0];

        // 4.1. Сохраняем метаданные в Firestore
        db.collection("videos").add({
            title: videoTitle,
            url: result.info.secure_url, // Ссылка на видео
            author: user.displayName,
            author_uid: user.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
            document.getElementById('upload-status').textContent = `✅ Видео "${videoTitle}" успешно опубликовано!`;
            document.getElementById('video-title').value = ''; // Очистка поля
            loadVideos(); 
        })
        .catch(e => {
            document.getElementById('upload-status').textContent = `❌ Ошибка БД: ${e.message}`;
        });
    } else if (error) {
         document.getElementById('upload-status').textContent = `❌ Ошибка загрузки: ${error.message}`;
    }
});

document.getElementById("upload-widget").addEventListener("click", function(){
    if (auth.currentUser) {
        document.getElementById('upload-status').textContent = 'Открытие окна загрузки...';
        document.getElementById('upload-loader').style.display = 'block'; // Показываем лоадер
        uploadWidget.open();
    } else {
        alert("Пожалуйста, войдите через Google, чтобы загрузить видео.");
    }
});


// --- 5. ЗАГРУЗКА ГАЛЕРЕИ (Firestore) ---

function loadVideos() {
    const grid = document.getElementById('video-grid');
    grid.innerHTML = '<div class="loader" style="display: block; margin: 50px auto;"></div>';
    
    db.collection("videos").orderBy("timestamp", "desc").limit(15).get()
    .then(snapshot => {
        grid.innerHTML = '';
        if (snapshot.empty) {
            grid.innerHTML = '<p style="text-align:center;">Видео пока нет. Начните загрузку!</p>';
            return;
        }

        snapshot.forEach(doc => {
            const video = doc.data();
            const card = document.createElement('div');
            card.className = 'video-card';
            
            card.innerHTML = `
                <video controls>
                    <source src="${video.url}" type="video/mp4">
                    Ваш браузер не поддерживает видео.
                </video>
                <h3>${video.title}</h3>
                <p>Автор: ${video.author || 'Неизвестно'} | Дата: ${video.timestamp ? video.timestamp.toDate().toLocaleDateString() : '—'}</p>
            `;
            grid.appendChild(card);
        });
    })
    .catch(error => {
        grid.innerHTML = `<p style="color:red; text-align:center;">Ошибка загрузки галереи: ${error.message}</p>`;
    });
}

// Запуск при старте
loadVideos();