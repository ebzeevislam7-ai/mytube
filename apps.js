import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, query, where, orderBy, onSnapshot, 
  doc, updateDoc, addDoc, serverTimestamp, setLogLevel 
} from 'firebase/firestore';
import { Heart, MessageSquare, Send, User } from 'lucide-react';

// Установка уровня логирования Firebase (помогает при отладке)
setLogLevel('debug');

// Глобальные переменные, предоставляемые средой Canvas
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Инициализация Firebase (выполняется один раз)
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Основной компонент приложения
const App = () => {
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState('Анонимный Пользователь');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  
  // --- Инициализация Аутентификации и Пользователя ---
  useEffect(() => {
    // 1. Установка состояния аутентификации
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        // В реальном приложении здесь можно загрузить имя пользователя из Firestore
        setUserName(user.email || `Пользователь-${user.uid.substring(0, 4)}`);
      } else {
        setUserId(null);
        setUserName('Анонимный Пользователь');
      }
      setIsAuthReady(true);
    });

    // 2. Первоначальный вход
    const signInUser = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Ошибка аутентификации Firebase:", error);
      }
    };

    if (!auth.currentUser) {
      signInUser();
    }

    return () => unsubscribe();
  }, []);

  // --- Загрузка Списка Видео (Публичные данные) ---
  useEffect(() => {
    if (!isAuthReady) return;

    const videosCollectionPath = `artifacts/${appId}/public/data/videos`;
    const q = query(collection(db, videosCollectionPath), orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const videoList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Преобразование likes в объект для удобства
        likes: doc.data().likes || {},
        likeCount: Object.keys(doc.data().likes || {}).length
      }));
      setVideos(videoList);
      // Если видео не выбрано, выбираем первое
      if (!selectedVideo && videoList.length > 0) {
        setSelectedVideo(videoList[0]);
      }
    }, (error) => {
      console.error("Ошибка загрузки видео:", error);
    });

    return () => unsubscribe();
  }, [isAuthReady, selectedVideo]);


  // --- Загрузка Комментариев для Выбранного Видео (Реалтайм) ---
  useEffect(() => {
    if (!isAuthReady || !selectedVideo?.id) {
      setComments([]);
      return;
    }
    
    setLoadingComments(true);
    const commentsCollectionPath = `artifacts/${appId}/public/data/comments`;
    
    // Запрос с фильтрацией и сортировкой, требующий индекса (который вы, надеюсь, создали!)
    const q = query(
      collection(db, commentsCollectionPath),
      where('videoId', '==', selectedVideo.id),
      orderBy('timestamp', 'asc') // Сортировка по возрастанию времени
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Форматирование временной метки для отображения
        displayTime: doc.data().timestamp?.toDate()?.toLocaleTimeString('ru-RU', { 
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
        }) || 'Только что'
      }));
      setComments(loadedComments);
      setLoadingComments(false);
    }, (error) => {
      console.error("Ошибка загрузки комментариев:", error);
      setLoadingComments(false);
    });

    return () => unsubscribe();
  }, [isAuthReady, selectedVideo?.id]);


  // --- ФУНКЦИЯ ИСПРАВЛЕНИЯ #1: Быстрое обновление Лайков ---
  const handleLike = useCallback(async (video) => {
    if (!userId) {
      console.warn("Пользователь не авторизован для постановки лайка.");
      // В реальном приложении покажите модальное окно с сообщением
      return;
    }
    
    const videoRef = doc(db, `artifacts/${appId}/public/data/videos`, video.id);
    const currentLikes = video.likes || {};
    const hasLiked = !!currentLikes[userId];
    
    // Подготовка данных для атомарного обновления
    const updateData = {};

    if (hasLiked) {
      // Удаляем лайк: Firestore.FieldValue.delete() недоступен напрямую
      // Используем простой объект, но делаем обновление атомарным
      // Внимание: для удаления поля вложенного объекта нужно знать путь
      updateData[`likes.${userId}`] = false; // Установка false или удаление
    } else {
      // Ставим лайк: устанавливаем текущее время или булево true
      updateData[`likes.${userId}`] = true;
    }
    
    try {
      // Это атомарная операция, которая должна быть очень быстрой
      await updateDoc(videoRef, updateData);
      // UI обновится автоматически благодаря onSnapshot
    } catch (error) {
      console.error("Ошибка при обновлении лайка:", error);
      // В случае ошибки, вы можете откатить локальное состояние, если бы оно было
    }
  }, [userId]);


  // --- ФУНКЦИЯ ИСПРАВЛЕНИЯ #2: Отправка Комментария ---
  const handleCommentSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!userId || !selectedVideo?.id || !newCommentText.trim()) {
      console.warn("Невозможно отправить комментарий: нет пользователя, видео или текста.");
      // В реальном приложении покажите модальное окно с предупреждением
      return;
    }
    
    const commentsCollectionPath = `artifacts/${appId}/public/data/comments`;
    
    const newComment = {
      videoId: selectedVideo.id,
      userId: userId,
      userName: userName, // Используем имя пользователя из состояния
      text: newCommentText.trim(),
      timestamp: serverTimestamp(), // Обязательно используем серверную метку времени
    };
    
    try {
      await addDoc(collection(db, commentsCollectionPath), newComment);
      setNewCommentText(''); // Очистить поле ввода после успешной отправки
      // UI обновится автоматически благодаря onSnapshot
    } catch (error) {
      console.error("Ошибка при добавлении комментария:", error);
      // В случае ошибки, вы можете показать сообщение об ошибке пользователю
    }
  }, [userId, userName, selectedVideo?.id, newCommentText]);

  // Вывод "заглушки" пока не готова аутентификация
  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-lg font-medium text-indigo-600">Загрузка приложения...</p>
      </div>
    );
  }

  // Рендер компонентов
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row font-sans p-4 md:p-6">
      
      {/* Левая панель: Список Видео */}
      <div className="md:w-1/4 w-full md:pr-4 mb-6 md:mb-0">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">Видеолента</h2>
        <div className="space-y-3 max-h-[80vh] overflow-y-auto">
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
          {videos.length === 0 && <p className="text-gray-500">Нет доступных видео.</p>}
        </div>
      </div>

      {/* Правая панель: Плеер и Комментарии */}
      <div className="md:w-3/4 w-full bg-white rounded-xl shadow-2xl p-6">
        {selectedVideo ? (
          <>
            {/* Видеоплеер (Заглушка) */}
            <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center mb-4 relative overflow-hidden">
              <div className="text-white text-2xl font-bold p-4 text-center">
                {selectedVideo.title}
                <div className="text-sm text-gray-400 mt-2">
                  (Плеер - Заглушка)
                  <p className="mt-1 text-xs">ID: {selectedVideo.id}</p>
                </div>
              </div>
            </div>

            {/* Информация о Видео и Лайки */}
            <div className="flex justify-between items-start mb-4 border-b pb-4">
              <div>
                <h1 className="text-3xl font-extrabold text-gray-900 mb-1">{selectedVideo.title}</h1>
                <p className="text-base text-gray-600 mb-2">{selectedVideo.description}</p>
                <div className="text-sm text-gray-400">
                   <User size={14} className="inline mr-1"/>Вы вошли как: {userName} (ID: {userId.substring(0, 8)}...)
                </div>
              </div>

              {/* Кнопка Лайка (FIXED) */}
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

            {/* Раздел Комментариев */}
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Комментарии ({comments.length})</h2>
            
            {/* Форма Отправки Комментария (FIXED) */}
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

            {/* Список Комментариев */}
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
