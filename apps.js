// =======================================================================
// 1. FIREBASE CONFIGURATION (ВАШИ КЛЮЧИ)
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
// 2. CLOUDINARY CONFIGURATION (ВАШИ КЛЮЧИ)
// =======================================================================
const CLOUDINARY_CONFIG = {
    cloudName: "dv05ksrho", 
    uploadPreset: "dv05ksrho" 
};
// =======================================================================

// =======================================================================
// 3. ADMIN CONFIGURATION
// =======================================================================
const ADMIN_EMAIL = 'ebzeevislam7@gmail.com';
const ADMIN_UID = 'Zm0GnCV3iEb7qInxqNZ13lTdABA3'; // ВАШ UID АДМИНА

function isAdmin(user) {
    return user && user.uid === ADMIN_UID;
}

// Функция удаления (доступна только из консоли для админа)
function deleteVideo(docId, title) {
    if (!auth.currentUser || !isAdmin(auth.currentUser)) {
        uploadStatus.textContent = '❌ У вас нет прав администратора для удаления.';
        return;
    }

    if (!confirm(`Вы уверены, что хотите удалить видео "${title}"? Это действие необратимо!`)) {
        return;
    }

    uploadStatus.textContent = `Попытка удаления видео "${title}"...`;
    uploadLoader.classList.remove('hidden');

    db.collection("videos").doc(docId).delete()
        .then(() => {
            uploadStatus.textContent = `✅ Видео "${title}" успешно удалено.`;
        })
        .catch(error => {
            console.error("Error removing document: ", error);
            uploadStatus.textContent = `❌ Ошибка при удалении: ${error.message}`;
        })
        .finally(() => {
            uploadLoader.classList.add('hidden');
        });
}
// =======================================================================


// Initialization
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- Global State ---
let currentVideoId = null; 
let allVideos = []; // Stores all videos for recommendations and rendering
let commentsUnsubscribe = null; // Listener for comments (must be cleaned up)
let currentLikes = {}; // { videoId: { likeId: { userId, videoId } } } - Store fetched likes
let currentVideoLikesUnsubscribe = null; // Listener for likes on the currently viewed video

// --- UI Elements ---
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const uploadSection = document.getElementById('upload-section');
const videoTitleInput = document.getElementById('video-title');
const uploadStatus = document.getElementById('upload-status');
const videoGrid = document.getElementById('video-grid');
const uploadLoader = document.getElementById('upload-loader');
const loginOptions = document.getElementById('login-options');
const mainGridView = document.getElementById('main-grid-view');
const watchPageView = document.getElementById('watch-page-view');
const videoPlayerContainer = document.getElementById('video-player-container');
const videoMetadataSection = document.getElementById('video-metadata-section');
const commentsList = document.getElementById('comments-list');
const recommendationsList = document.getElementById('recommendations-list');
const commentFormContainer = document.getElementById('comment-form-container');
const postCommentBtn = document.getElementById('post-comment-btn');
const commentTextarea = document.getElementById('comment-text');
const commentAuthMessage = document.getElementById('comment-auth-message');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const emailAuthStatus = document.getElementById('email-auth-status');
const emailRegisterBtn = document.getElementById('email-register-btn');
const emailLoginBtn = document.getElementById('email-login-btn');


// =======================================================================
// 4. NAVIGATION / ROUTING
// =======================================================================
function showPage(pageName) {
    if (pageName === 'grid') {
        mainGridView.classList.remove('hidden');
        watchPageView.classList.add('hidden');
        currentVideoId = null;
        // Clean up old listeners
        if (commentsUnsubscribe) {
            commentsUnsubscribe();
            commentsUnsubscribe = null;
        }
        if (currentVideoLikesUnsubscribe) {
            currentVideoLikesUnsubscribe();
            currentVideoLikesUnsubscribe = null;
        }
    } else if (pageName === 'watch') {
        mainGridView.classList.add('hidden');
        watchPageView.classList.remove('hidden');
    }
}

function navigateToVideo(videoId) {
    currentVideoId = videoId;
    showPage('watch');
    
    const videoData = allVideos.find(v => v.id === videoId);
    if (!videoData) {
        videoPlayerContainer.innerHTML = `<p class="text-red-400">Видео не найдено. Вернитесь на главную.</p>`;
        return;
    }

    renderWatchPage(videoData);
    setupCommentsListener(videoId);
    setupLikesListener(videoId); // НОВЫЙ ЛИСЕНЕР ДЛЯ ЛАЙКОВ
}

// =======================================================================
// 5. RENDER FUNCTIONS
// =======================================================================

// Renders the main video grid cards 
function renderVideos(snapshot) {
    videoGrid.innerHTML = '';
    allVideos = []; 
    
    if (snapshot.empty) {
        videoGrid.innerHTML = '<p class="text-center col-span-full text-gray-400">Видео пока нет. Загрузите первое!</p>';
        return;
    }

    const isCurrentUserAdmin = auth.currentUser && isAdmin(auth.currentUser);

    snapshot.forEach(doc => {
        const video = doc.data();
        video.id = doc.id; 
        allVideos.push(video); 
        
        const date = video.timestamp ? 
                     video.timestamp.toDate().toLocaleDateString('ru-RU') : 
                     '—';
        // Теперь счетчик лайков берется из глобального состояния currentLikes
        const likesCount = Object.keys(currentLikes[doc.id] || {}).length; 

        const card = document.createElement('div');
        card.className = 'video-card glass-card p-4 rounded-xl transition transform hover:scale-[1.02] hover:shadow-2xl cursor-pointer'; 
        card.setAttribute('data-video-id', doc.id);
        card.onclick = () => navigateToVideo(doc.id);

        card.innerHTML = `
            <div class="video-player">
                <video class="video-player" src="${video.url}" preload="metadata"></video>
            </div>
            <h3 class="text-lg font-semibold mt-2 text-white">${video.title}</h3>
            <p class="text-sm text-gray-300">Автор: <span class="text-mac-lilac">${video.author || 'Аноним'}</span></p>
            <div class="flex justify-between items-center text-xs mt-2">
                <p class="text-gray-400">Опубликовано: ${date}</p>
                <p class="text-gray-400 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 mr-1 text-red-500">
                        <path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.716 3 7.688 3A5.5 5.5 0 0 1 12 5.059 5.5 5.5 0 0 1 16.313 3c2.973 0 5.439 2.322 5.439 5.25 0 3.924-2.438 7.11-4.75 8.825a25.179 25.179 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.001.001A.752.752 0 0 0 12 21Z" />
                    </svg>
                    ${likesCount}
                </p>
            </div>
            ${isCurrentUserAdmin ? 
                `<button class="delete-btn mt-3 bg-red-600 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md hover:bg-red-500 transition" 
                             data-doc-id="${doc.id}" data-video-title="${video.title}" onclick="deleteVideo('${doc.id}', '${video.title}')">
                    Удалить (Админ)
                </button>` : ''}
        `;
        videoGrid.appendChild(card);
    });
}

// Renders the single video watch page (updates likes based on currentLikes state)
function renderWatchPage(video) {
    const isCurrentUserAdmin = auth.currentUser && isAdmin(auth.currentUser);

    // 1. Render Player (unchanged)
    videoPlayerContainer.innerHTML = `
        <video id="main-video-player" controls class="video-player">
            <source src="${video.url}" type="video/mp4">
            Ваш браузер не поддерживает видео.
        </video>
    `;

    // 2. Render Metadata and Like button (UPDATED LOGIC)
    const currentVideoLikes = currentLikes[video.id] || {};
    const likesCount = Object.keys(currentVideoLikes).length;
    const currentUserId = auth.currentUser ? auth.currentUser.uid : null;
    
    // Проверяем, лайкнул ли пользователь. Ищем likeId, где userId совпадает
    const userLikeEntry = Object.entries(currentVideoLikes).find(([id, like]) => like.userId === currentUserId);
    const isLiked = !!userLikeEntry;
    const existingLikeId = userLikeEntry ? userLikeEntry[0] : null;

    videoMetadataSection.innerHTML = `
        <h2 class="text-3xl font-bold mb-3">${video.title}</h2>
        <div class="flex items-center justify-between">
            <p class="text-sm text-gray-300">
                Автор: <span class="text-mac-lilac font-semibold">${video.author || 'Аноним'}</span>
            </p>
            <div class="flex items-center space-x-4">
                <button id="like-btn" class="flex items-center space-x-1 p-2 rounded-xl transition ${isLiked ? 'bg-red-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}" ${currentUserId ? '' : 'disabled'}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                        <path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.716 3 7.688 3A5.5 5.5 0 0 1 12 5.059 5.5 5.5 0 0 1 16.313 3c2.973 0 5.439 2.322 5.439 5.25 0 3.924-2.438 7.11-4.75 8.825a25.179 25.179 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.001.001A.752.752 0 0 1 12 21Z" />
                    </svg>
                    <span id="likes-count">${likesCount}</span>
                </button>

                ${isCurrentUserAdmin ? 
                    `<button class="delete-btn bg-red-600 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md hover:bg-red-500 transition" 
                                 data-doc-id="${video.id}" data-video-title="${video.title}" onclick="deleteVideo('${video.id}', '${video.title}')">
                        Удалить Видео (Админ)
                    </button>` : ''}
            </div>
        </div>
    `;
    
    // Add Like listener (UPDATED LOGIC)
    document.getElementById('like-btn')?.addEventListener('click', () => {
        if (currentUserId) {
            // Передаем существующий likeId, если он есть
            toggleLike(video.id, currentUserId, existingLikeId);
        } else {
            uploadStatus.textContent = '❌ Войдите, чтобы ставить лайки.';
        }
    });

    // 3. Render Recommendations
    renderRecommendations(video.id);
}


// Renders the recommendations sidebar
function renderRecommendations(excludeId) {
    recommendationsList.innerHTML = '';
    
    const recommendations = allVideos
        .filter(v => v.id !== excludeId)
        .sort(() => 0.5 - Math.random()) 
        .slice(0, 5); 

    if (recommendations.length === 0) {
        recommendationsList.innerHTML = '<p class="text-gray-400">Нет других рекомендаций.</p>';
        return;
    }

    recommendations.forEach(video => {
        const date = video.timestamp ? 
                     video.timestamp.toDate().toLocaleDateString('ru-RU') : '—';
        // Лайки из глобального состояния
        const likesCount = Object.keys(currentLikes[video.id] || {}).length; 

        const recItem = document.createElement('div');
        recItem.className = 'flex space-x-3 glass-card p-3 rounded-xl cursor-pointer hover:bg-white/10 transition';
        recItem.onclick = () => navigateToVideo(video.id);

        recItem.innerHTML = `
            <div class="flex-shrink-0 w-24 h-14 rounded-lg overflow-hidden bg-black">
                <video src="${video.url}" preload="metadata" class="w-full h-full object-cover"></video>
            </div>
            <div class="flex-grow">
                <p class="text-sm font-semibold truncate hover:text-mac-lilac">${video.title}</p>
                <p class="text-xs text-gray-400">${video.author || 'Аноним'}</p>
                <p class="text-xs text-gray-500">${likesCount} лайков</p>
            </div>
        `;
        recommendationsList.appendChild(recItem);
    });
}

// =======================================================================
// 6. LIKES LOGIC (NEW, using 'likes' collection)
// =======================================================================

// Handles adding or removing a like
function toggleLike(videoId, userId, existingLikeId) {
    if (existingLikeId) {
        // Дизлайк: удаляем документ
        db.collection("likes").doc(existingLikeId).delete()
            .then(() => {
                uploadStatus.textContent = '💔 Дизлайк удален!';
            })
            .catch(error => {
                console.error("Dislike Failed:", error);
                uploadStatus.textContent = `❌ Ошибка при снятии лайка: ${error.message}`;
            });
    } else {
        // Лайк: добавляем новый документ
        db.collection("likes").add({
            videoId: videoId,
            userId: userId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
            uploadStatus.textContent = '❤️ Лайк поставлен!';
        })
        .catch(error => {
            console.error("Like Failed:", error);
            uploadStatus.textContent = `❌ Ошибка при постановке лайка: ${error.message}`;
        });
    }
    setTimeout(() => uploadStatus.textContent = '', 3000); 
}

// Global listener for all likes to update the main grid and state
db.collection("likes").onSnapshot(snapshot => {
    const newLikes = {};
    
    // Группируем лайки по videoId
    snapshot.forEach(doc => {
        const like = doc.data();
        const videoId = like.videoId;
        
        if (!newLikes[videoId]) {
            newLikes[videoId] = {};
        }
        // Храним данные о лайке (docId и userId)
        newLikes[videoId][doc.id] = { userId: like.userId, videoId: like.videoId };
    });
    
    currentLikes = newLikes;
    
    // Если мы на главной странице, перерисовываем видео для обновления счетчиков
    if (!currentVideoId) {
        // Вызываем рендеринг, используя текущие данные allVideos 
        // (чтобы избежать повторного запроса к коллекции videos)
        renderVideos(db.collection("videos").orderBy("timestamp", "desc").get()); 
    }
    
    // Если мы на странице просмотра, вызываем рендеринг страницы
    if (currentVideoId) {
        const latestVideoData = allVideos.find(v => v.id === currentVideoId);
        if (latestVideoData) renderWatchPage(latestVideoData);
    }
}, error => {
    console.error("Error fetching all likes:", error);
});


// =======================================================================
// 7. COMMENTS LOGIC (Real-time)
// =======================================================================

// Sets up the real-time listener for comments of the current video
function setupCommentsListener(videoId) {
    if (commentsUnsubscribe) {
        commentsUnsubscribe();
    }

    commentsList.innerHTML = '<p class="text-gray-400">Загрузка комментариев...</p>';

    // Subscribe to new listener
    commentsUnsubscribe = db.collection("comments")
        .where("videoId", "==", videoId)
        .orderBy("timestamp", "asc")
        .onSnapshot(snapshot => {
            commentsList.innerHTML = '';
            if (snapshot.empty) {
                commentsList.innerHTML = '<p class="text-gray-400">Будьте первым, кто оставит комментарий!</p>';
                return;
            }
            
            snapshot.forEach(doc => {
                const comment = doc.data();
                const date = comment.timestamp ? 
                                 comment.timestamp.toDate().toLocaleString('ru-RU') : '—';
                
                const commentDiv = document.createElement('div');
                commentDiv.className = 'border-t border-white/10 pt-3';
                commentDiv.innerHTML = `
                    <p class="text-sm font-semibold text-mac-lilac">${comment.userName}</p>
                    <p class="text-base text-white mt-1">${comment.text}</p>
                    <p class="text-xs text-gray-500">${date}</p>
                `;
                commentsList.appendChild(commentDiv);
            });
        }, error => {
            console.error("FIREBASE ERROR: Comments loading failed.", error);
            commentsList.innerHTML = `<p class="text-red-400">
                **Ошибка загрузки комментариев.** Проверьте консоль браузера (F12) на наличие ссылки для создания индекса Firestore.
            </p>`;
        });
}


// Event handler for posting a new comment
postCommentBtn.addEventListener('click', () => {
    const user = auth.currentUser;
    const text = commentTextarea.value.trim();

    if (!user) {
        alert('Сначала войдите, чтобы комментировать.');
        return;
    }
    if (!text || !currentVideoId) {
        alert('Введите текст комментария.');
        return;
    }
    
    const userName = user.displayName || user.email.split('@')[0];

    db.collection("comments").add({
        videoId: currentVideoId,
        userId: user.uid,
        userName: userName,
        text: text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        commentTextarea.value = ''; // Clear textarea
        uploadStatus.textContent = '✅ Комментарий отправлен!';
        setTimeout(() => uploadStatus.textContent = '', 3000); // Clear after 3 seconds
    })
    .catch(error => {
        console.error("Comment Post Failed:", error);
        uploadStatus.textContent = `❌ Ошибка комментирования: ${error.message}`;
    });
});

// =======================================================================
// 8. AUTHENTICATION (Handled by Firebase Auth)
// =======================================================================

// Google Login
googleLoginBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        emailAuthStatus.textContent = `❌ Ошибка входа через Google: ${error.message}`;
    });
});

// Email Registration
emailRegisterBtn.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || password.length < 6) {
        emailAuthStatus.textContent = '❌ Неверный Email или пароль (мин 6 символов).';
        return;
    }
    auth.createUserWithEmailAndPassword(email, password)
        .then(() => {
            emailAuthStatus.textContent = '✅ Регистрация успешна! Выполнен вход.';
        })
        .catch(error => {
            emailAuthStatus.textContent = `❌ Ошибка регистрации: ${error.message}`;
        });
});

// Email Login
emailLoginBtn.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            emailAuthStatus.textContent = '✅ Вход успешен!';
        })
        .catch(error => {
            emailAuthStatus.textContent = `❌ Ошибка входа: ${error.message}`;
        });
});

// Logout
logoutBtn.addEventListener('click', () => {
    auth.signOut();
    uploadStatus.textContent = 'Вы вышли из аккаунта.';
    setTimeout(() => uploadStatus.textContent = '', 3000);
});

// Auth State Change Listener (The main UI Updater)
auth.onAuthStateChanged(user => {
    const isAuthenticated = !!user;

    if (isAuthenticated) {
        const displayName = user.displayName ? user.displayName.split(' ')[0] : user.email.split('@')[0];
        userInfo.textContent = `Привет, ${displayName}! ${isAdmin(user) ? '👑 АДМИН' : ''}`; 
        logoutBtn.classList.remove('hidden');
        uploadSection.classList.remove('hidden');
        loginOptions.classList.add('hidden');
        
        // Comment form state
        commentAuthMessage.classList.add('hidden');
        postCommentBtn.disabled = false;
        
    } else {
        userInfo.textContent = 'Войдите, чтобы загружать видео.';
        logoutBtn.classList.add('hidden');
        uploadSection.classList.add('hidden');
        loginOptions.classList.remove('hidden');
        
        // Comment form state
        commentAuthMessage.classList.remove('hidden');
        postCommentBtn.disabled = true;
    }
    
    // Re-render the watch page to update like/delete buttons if auth state changes
    if (currentVideoId) {
        const latestVideoData = allVideos.find(v => v.id === currentVideoId);
        if (latestVideoData) renderWatchPage(latestVideoData);
    }
});


// =======================================================================
// 9. UPLOAD WIDGET SETUP
// =======================================================================
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
        
        // Сохраняем метаданные в Firestore
        db.collection("videos").add({
            title: title,
            url: result.info.secure_url,
            author: user.displayName || user.email.split('@')[0],
            authorUid: user.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .then(() => {
            uploadStatus.textContent = `✅ Видео "${title}" успешно опубликовано!`;
            videoTitleInput.value = ''; // Clear input
        })
        .catch(e => {
            uploadStatus.textContent = `❌ Ошибка записи в базу: ${e.message}`;
            console.error("Database write error:", e);
        });

    } else if (result && result.event === "abort") {
        uploadStatus.textContent = 'Загрузка отменена пользователем.';
    } else if (error) {
        uploadStatus.textContent = `❌ Ошибка загрузки Cloudinary: ${error.message}`;
    }
});

document.getElementById('upload-widget').addEventListener('click', () => {
    if (!auth.currentUser) {
        uploadStatus.textContent = '❌ Войдите, чтобы загружать видео.';
        return;
    }
    
    const title = videoTitleInput.value.trim();
    if (!title) {
        uploadStatus.textContent = '❌ Введите заголовок видео перед выбором файла!';
        videoTitleInput.focus();
        return;
    }
    
    uploadStatus.textContent = 'Открытие виджета загрузки...';
    uploadLoader.classList.remove('hidden');

    uploadWidget.open();
});


// =======================================================================
// 10. INITIAL DATA LOAD (Real-time listener for the main grid)
// =======================================================================
// Подписываемся на ВСЕ видео, отсортированные по времени создания (новые сверху)
db.collection("videos").orderBy("timestamp", "desc").onSnapshot(snapshot => {
    // Эта функция будет вызываться только при изменении видео-документов (title, url)
    // Лайки обновляются отдельным лисенером (см. п.6)
    renderVideos(snapshot); 
    
}, error => {
    console.error("Error fetching videos:", error);
    videoGrid.innerHTML = '<p class="text-center col-span-full text-red-400">Не удалось загрузить видео. Проверьте подключение к Firestore.</p>';
});
