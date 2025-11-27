import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  getFirestore, collection, query, where, orderBy, onSnapshot, 
  doc, updateDoc, addDoc, serverTimestamp, setLogLevel 
} from 'firebase/firestore';
import { Heart, MessageSquare, Send, User, LogOut } from 'lucide-react'; 

// Установка уровня логирования Firebase (помогает при отладке)
setLogLevel('debug');

// Глобальные переменные, предоставляемые средой Canvas
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Инициализация Firebase (выполняется один раз)
let app, db, auth;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.error("Firebase Initialization Error:", error);
}

// Main Application Component
const App = () => {
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState('Анонимный Пользователь');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  
  // --- Атомарное определение путей к коллекциям ---
  const videosCollectionPath = useMemo(() => `artifacts/${appId}/public/data/videos`, []);
  const commentsCollectionPath = useMemo(() => `artifacts/${appId}/public/data/comments`, []);

  // --- Sign Out Function ---
  const handleSignOut = useCallback(async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setSelectedVideo(null); 
      setVideos([]);
    } catch (error) {
      console.error("Ошибка при выходе из системы:", error);
    }
  }, []);

  // --- Auth Initialization and Listener ---
  useEffect(() => {
    if (!auth) return;

    // 1. Authentication State Listener
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        setUserName(user.email || `Пользователь-${user.uid.substring(0, 4)}`);
      } else {
        setUserId(null);
        setUserName('Анонимный Пользователь');
        
        // If user explicitly signs out, we sign them in anonymously 
        // to ensure they can still read public data and log in again.
        if (!auth.currentUser) {
           await signInAnonymously(auth);
        }
      }
      setIsAuthReady(true);
    });

    // 2. Initial Sign-in Attempt
    const signInUser = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase authentication error:", error);
      }
    };

    if (!auth.currentUser) {
      signInUser();
    }

    return () => unsubscribe();
  }, []);

  // --- Load Video List (Public Data) ---
  useEffect(() => {
    // Усиленный GUARD: Только запрос Firestore после готовности аутентификации и наличия db
    if (!isAuthReady || !db) return; 

    // Используем атомарно определенный путь
    // ВРЕМЕННО УБИРАЕМ orderBy('timestamp', 'desc') для проверки ошибки 'permissions',
    // которая часто маскирует ошибку отсутствия индекса.
    const q = query(collection(db, videosCollectionPath)); // Изменено
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const videoList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        likes: doc.data().likes || {},
        // Filter out false/null likes when counting
        likeCount: Object.values(doc.data().likes || {}).filter(val => val).length
      }));
      setVideos(videoList);
      if (!selectedVideo && videoList.length > 0) {
        setSelectedVideo(videoList[0]);
      }
    }, (error) => {
      console.error("Error fetching videos:", error); 
    });

    return () => unsubscribe();
  }, [isAuthReady, db, selectedVideo]); // Добавлена зависимость db

  // --- Load Comments for Selected Video (Real-time) ---
  useEffect(() => {
    if (!isAuthReady || !selectedVideo?.id || !db) {
      setComments([]);
      return;
    }
    
    setLoadingComments(true);
    
    // Используем атомарно определенный путь
    const q = query(
      collection(db, commentsCollectionPath),
      where('videoId', '==', selectedVideo.id),
      orderBy('timestamp', 'asc') // Сортировка комментариев сохранена
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        displayTime: doc.data().timestamp?.toDate()?.toLocaleTimeString('ru-RU', { 
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
        }) || 'Только что'
      }));
      setComments(loadedComments);
      setLoadingComments(false);
    }, (error) => {
      console.error("Error loading comments:", error);
      setLoadingComments(false);
    });

    return () => unsubscribe();
  }, [isAuthReady, db, selectedVideo?.id]); // Добавлена зависимость db


  // --- Like/Unlike Function (Optimized for speed) ---
  const handleLike = useCallback(async (video) => {
    if (!userId || !db) {
      console.warn("Пользователь не авторизован или DB недоступна.");
      return;
    }
    
    const videoRef = doc(db, videosCollectionPath, video.id);
    const currentLikes = video.likes || {};
    const hasLiked = currentLikes[userId] === true;
    
    const updateData = {};

    if (hasLiked) {
      updateData[`likes.${userId}`] = false; 
    } else {
      updateData[`likes.${userId}`] = true; 
    }
    
    try {
      await updateDoc(videoRef, updateData);
    } catch (error) {
      console.error("Ошибка при обновлении лайка:", error);
    }
  }, [userId, videosCollectionPath]);


  // --- Comment Submission Function ---
  const handleCommentSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!userId || !selectedVideo?.id || !newCommentText.trim() || !db) {
      console.warn("Невозможно отправить комментарий: нет пользователя, видео, текста или DB.");
      return;
    }
        
    const newComment = {
      videoId: selectedVideo.id,
      userId: userId,
      userName: userName, 
      text: newCommentText.trim(),
      timestamp: serverTimestamp(), 
    };
    
    try {
      await addDoc(collection(db, commentsCollectionPath), newComment);
      setNewCommentText(''); 
    } catch (error) {
      console.error("Ошибка при добавлении комментария:", error);
    }
  }, [userId, userName, selectedVideo?.id, newCommentText, commentsCollectionPath]);

  // Display "Loading" until authentication state is resolved
  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-lg font-medium text-indigo-600">Загрузка приложения...</p>
      </div>
    );
  }

  // Render components
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row font-sans p-4 md:p-6">
      
      {/* Left Panel: Video List and Auth Info */}
      <div className="md:w-1/4 w-full md:pr-4 mb-6 md:mb-0">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">Видеолента</h2>
        
        {/* User Panel and Sign Out */}
        <div className="p-3 mb-4 bg-white rounded-lg shadow-md border border-indigo-200">
             <div className="flex justify-between items-center mb-2">
                <p className="font-semibold text-gray-900">
                    <User size={16} className="inline mr-2 text-indigo-600"/>
                    Вы: {userName}
                </p>
                <button 
                  onClick={handleSignOut}
                  className="flex items-center text-sm px-3 py-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
                  title="Выйти из текущего аккаунта"
                >
                  <LogOut size={14} className="mr-1"/> Выход
                </button>
             </div>
             <p className="text-xs text-gray-500 truncate">ID: {userId}</p>
        </div>

        {/* Video List */}
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {videos.map(video => (
            <div
              key={video.id}
              className={`p-3 rounded-lg shadow-md cursor-pointer transition duration-200 
                ${selectedVideo?.id === video.id ? 'bg-indigo-100 ring-2 ring-indigo-500' : 'bg-white hover:bg-gray-50'}`}
              onClick={() => setSelectedVideo(video)}
            >
              <h3 className="text-lg font-semibold text-gray-900 truncate">{video.title || 'Видео без названия'}</h3>
              <p className="text-sm text-gray-500 line-clamp-2">{video.description || 'Нет описания.'}</p>
              <div className="flex items-center text-xs text-gray-500 mt-1 space-x-3">
                <span className="flex items-center">
                  <Heart size={14} className="mr-1 text-red-500"/> {video.likeCount}
                </span>
                <span className="flex items-center">
                  <MessageSquare size={14} className="mr-1 text-blue-500"/> {comments.filter(c => c.videoId === video.id).length}
                </span>
              </div>
            </div>
          ))}
          {videos.length === 0 && <p className="text-gray-500 p-3 bg-white rounded-lg shadow-md">Нет доступных видео.</p>}
        </div>
      </div>

      {/* Right Panel: Player and Comments */}
      <div className="md:w-3/4 w-full bg-white rounded-xl shadow-2xl p-6">
        {selectedVideo ? (
          <>
            {/* Video Player Placeholder */}
            <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center mb-4 relative overflow-hidden">
              <div className="text-white text-2xl font-bold p-4 text-center">
                {selectedVideo.title}
                <div className="text-sm text-gray-400 mt-2">
                  (Плеер - Заглушка)
                  <p className="mt-1 text-xs">ID: {selectedVideo.id}</p>
                </div>
              </div>
            </div>

            {/* Video Info and Likes */}
            <div className="flex justify-between items-start mb-4 border-b pb-4">
              <div>
                <h1 className="text-3xl font-extrabold text-gray-900 mb-1">{selectedVideo.title}</h1>
                <p className="text-base text-gray-600 mb-2">{selectedVideo.description}</p>
              </div>

              {/* Like Button */}
              <button
                onClick={() => handleLike(selectedVideo)}
                className={`flex items-center px-4 py-2 rounded-full transition-all duration-300 
                  ${selectedVideo.likes[userId] ? 'bg-red-500 text-white shadow-lg' : 'bg-gray-200 text-gray-700 hover:bg-red-100 hover:text-red-500'}`}
                disabled={!userId}
              >
                <Heart size={20} className="mr-2 fill-current"/>
                {selectedVideo.likeCount} {selectedVideo.likes[userId] ? 'Нравится!' : 'Лайк'}
              </button>
            </div>

            {/* Comments Section */}
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Комментарии ({comments.length})</h2>
            
            {/* Comment Submission Form */}
            <form onSubmit={handleCommentSubmit} className="mb-6 flex space-x-2">
              <textarea
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder={userId ? "Напишите свой комментарий..." : "Войдите, чтобы комментировать..."}
                rows="2"
                className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none transition"
                disabled={!userId}
              />
              <button
                type="submit"
                className={`flex items-center px-4 py-2 rounded-lg text-white font-semibold transition duration-300 
                  ${!userId || !newCommentText.trim() ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-md'}`}
                disabled={!userId || !newCommentText.trim()}
              >
                <Send size={20} className="mr-1"/> Отправить
              </button>
            </form>

            {/* Comments List */}
            {loadingComments ? (
              <p className="text-gray-500">Загрузка комментариев...</p>
            ) : (
              <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
                {comments.map(comment => (
                  <div key={comment.id} className="p-3 bg-gray-50 rounded-lg border-l-4 border-indigo-500 shadow-sm">
                    <div className="flex justify-between items-center mb-1">
                      <p className="font-semibold text-gray-900 flex items-center">
                        <User size={16} className="mr-2 text-indigo-600"/>
                        {comment.userName || 'Неизвестный'}
                      </p>
                      <span className="text-xs text-gray-400">{comment.displayTime}</span>
                    </div>
                    <p className="text-gray-700 break-words whitespace-pre-wrap">{comment.text}</p>
                  </div>
                ))}
                {comments.length === 0 && <p className="text-gray-500">Пока нет комментариев. Будьте первым!</p>}
              </div>
            )}
          </>
        ) : (
          <div className="text-center p-20 text-gray-500">
            <h1 className="text-2xl font-semibold">Выберите видео из списка слева, чтобы начать просмотр.</h1>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
