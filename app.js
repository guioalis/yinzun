/**
 * 实时音准监控应用
 * 主应用逻辑，处理UI交互和音准反馈
 */

// DOM元素
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const referenceNoteSelect = document.getElementById('referenceNote');
const noteDisplay = document.querySelector('.note-display');
const frequencyDisplay = document.querySelector('.frequency-display');
const tunerNeedle = document.querySelector('.tuner-needle');
const waveformCanvas = document.getElementById('waveformCanvas');
const accuracyFill = document.querySelector('.accuracy-fill');
const accuracyValue = document.querySelector('.accuracy-value');
const feedbackMessage = document.querySelector('.feedback-message');

// 歌曲上传相关DOM元素
const songFileInput = document.getElementById('songFileInput');
const fileName = document.getElementById('fileName');
const audioPlayer = document.getElementById('audioPlayer');
const playButton = document.getElementById('playButton');
const pauseButton = document.getElementById('pauseButton');
const analyzeButton = document.getElementById('analyzeButton');

// 音高检测器实例
const pitchDetector = new PitchDetector();

// 应用状态
let isListening = false;
let referenceNoteIndex = -1; // -1表示自动检测
let lastNoteIndex = -1;
let accuracyHistory = [];
const MAX_HISTORY_LENGTH = 10; // 保留最近10个音符的准确度

// 歌曲分析器实例
let audioAnalyzer = null;

// 歌曲分析状态
let songData = {
    audioBuffer: null,
    noteData: [],
    isAnalyzed: false
};

// 画布上下文
const canvasCtx = waveformCanvas.getContext('2d');

// 初始化应用
async function initApp() {
    // 初始化音高检测器
    const initialized = await pitchDetector.init();
    
    if (!initialized) {
        feedbackMessage.textContent = '无法初始化音频系统，请检查浏览器权限';
        return;
    }
    
    // 设置回调函数
    pitchDetector.setCallbacks({
        onNoteDetected: handleNoteDetected,
        onWaveformData: drawWaveform,
        onError: handleError
    });
    
    // 设置事件监听器
    startButton.addEventListener('click', startListening);
    stopButton.addEventListener('click', stopListening);
    referenceNoteSelect.addEventListener('change', handleReferenceNoteChange);
    
    // 设置歌曲上传相关事件监听器
    songFileInput.addEventListener('change', handleSongFileSelect);
    playButton.addEventListener('click', playSong);
    pauseButton.addEventListener('click', pauseSong);
    analyzeButton.addEventListener('click', analyzeSong);
    
    // 初始化音频分析器
    audioAnalyzer = new AudioAnalyzer(pitchDetector.audioContext);
    
    // 调整画布大小
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

// 开始监听
async function startListening() {
    if (isListening) return;
    
    const started = await pitchDetector.start();
    
    if (started) {
        isListening = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        feedbackMessage.textContent = '正在监听...';
    }
}

// 停止监听
function stopListening() {
    if (!isListening) return;
    
    pitchDetector.stop();
    isListening = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    
    // 重置显示
    noteDisplay.textContent = '--';
    frequencyDisplay.textContent = '0 Hz';
    tunerNeedle.style.left = '50%';
    accuracyFill.style.width = '0%';
    accuracyValue.textContent = '0%';
    feedbackMessage.textContent = '监听已停止';
    
    // 清空历史记录
    accuracyHistory = [];
    lastNoteIndex = -1;
    
    // 清空波形图
    clearWaveform();
}

// 处理参考音符变更
function handleReferenceNoteChange() {
    referenceNoteIndex = parseInt(referenceNoteSelect.value);
    
    if (referenceNoteIndex >= 0) {
        feedbackMessage.textContent = `参考音符设置为: ${pitchDetector.noteStrings[referenceNoteIndex]}`;
    } else {
        feedbackMessage.textContent = '自动检测模式';
    }
}

// 处理检测到的音符
function handleNoteDetected(noteData) {
    const { frequency, note, noteIndex, octave, cents } = noteData;
    
    // 更新音符显示
    noteDisplay.textContent = `${note}${octave}`;
    frequencyDisplay.textContent = `${frequency.toFixed(1)} Hz`;
    
    // 确定参考音符
    let targetNoteIndex = referenceNoteIndex;
    if (targetNoteIndex === -1) {
        // 自动模式：如果是新音符，则将其设为参考音符
        if (lastNoteIndex === -1 || Math.abs(cents) > 50) {
            targetNoteIndex = noteIndex;
            lastNoteIndex = noteIndex;
        } else {
            targetNoteIndex = lastNoteIndex;
        }
    }
    
    // 计算与目标音符的偏差
    let deviation = cents;
    if (targetNoteIndex !== noteIndex) {
        // 如果检测到的音符与目标音符不同，计算半音差
        const semitones = (noteIndex - targetNoteIndex + 12) % 12;
        deviation = semitones * 100 + cents;
        
        // 如果偏差超过半个八度，则认为是向下偏离
        if (deviation > 600) {
            deviation = deviation - 1200;
        }
    }
    
    // 更新调音器指针位置
    // 将偏差映射到0-100%的位置（-50音分到+50音分）
    const needlePosition = Math.max(0, Math.min(100, (deviation + 50) / 100 * 100));
    tunerNeedle.style.left = `${needlePosition}%`;
    
    // 计算准确度（偏差越小，准确度越高）
    const accuracy = Math.max(0, 100 - Math.abs(deviation) * 2);
    
    // 添加到历史记录
    accuracyHistory.push(accuracy);
    if (accuracyHistory.length > MAX_HISTORY_LENGTH) {
        accuracyHistory.shift();
    }
    
    // 计算平均准确度
    const averageAccuracy = accuracyHistory.reduce((sum, val) => sum + val, 0) / accuracyHistory.length;
    
    // 更新准确度显示
    accuracyFill.style.width = `${averageAccuracy}%`;
    accuracyValue.textContent = `${Math.round(averageAccuracy)}%`;
    
    // 更新反馈信息
    updateFeedbackMessage(deviation, averageAccuracy);
}

// 更新反馈信息
function updateFeedbackMessage(deviation, accuracy) {
    if (accuracy >= 90) {
        feedbackMessage.textContent = '太棒了！音准非常准确！';
    } else if (accuracy >= 70) {
        feedbackMessage.textContent = '不错！音准相当好';
    } else if (accuracy >= 50) {
        if (deviation > 0) {
            feedbackMessage.textContent = '音高偏高，请稍微降低';
        } else {
            feedbackMessage.textContent = '音高偏低，请稍微提高';
        }
    } else {
        if (deviation > 0) {
            feedbackMessage.textContent = '音高明显偏高，需要降低';
        } else {
            feedbackMessage.textContent = '音高明显偏低，需要提高';
        }
    }
}

// 绘制波形图
function drawWaveform(waveformData) {
    if (!canvasCtx) return;
    
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    
    // 清空画布
    canvasCtx.clearRect(0, 0, width, height);
    
    // 设置线条样式
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#3498db';
    canvasCtx.beginPath();
    
    // 绘制波形
    const sliceWidth = width / waveformData.length;
    let x = 0;
    
    for (let i = 0; i < waveformData.length; i++) {
        const v = waveformData[i] / 128.0;
        const y = v * height / 2;
        
        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }
        
        x += sliceWidth;
    }
    
    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
}

// 清空波形图
function clearWaveform() {
    if (!canvasCtx) return;
    
    canvasCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
}

// 调整画布大小
function resizeCanvas() {
    waveformCanvas.width = waveformCanvas.clientWidth;
    waveformCanvas.height = waveformCanvas.clientHeight;
}

// 处理错误
function handleError(errorMessage) {
    feedbackMessage.textContent = errorMessage;
    console.error(errorMessage);
}

// 处理歌曲文件选择
function handleSongFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 显示文件名
    fileName.textContent = file.name;
    
    // 创建文件URL并设置到音频播放器
    const fileURL = URL.createObjectURL(file);
    audioPlayer.src = fileURL;
    
    // 启用播放按钮
    playButton.disabled = false;
    pauseButton.disabled = true;
    analyzeButton.disabled = false;
    
    // 重置歌曲分析状态
    songData.isAnalyzed = false;
    feedbackMessage.textContent = '歌曲已加载，可以播放或分析';
}

// 播放歌曲
function playSong() {
    audioPlayer.play();
    playButton.disabled = true;
    pauseButton.disabled = false;
}

// 暂停歌曲
function pauseSong() {
    audioPlayer.pause();
    playButton.disabled = false;
    pauseButton.disabled = true;
}

// 分析歌曲
async function analyzeSong() {
    if (!audioPlayer.src) {
        feedbackMessage.textContent = '请先选择一个音频文件';
        return;
    }
    
    feedbackMessage.textContent = '正在分析歌曲，请稍候...';
    analyzeButton.disabled = true;
    
    try {
        // 加载音频文件
        const audioBuffer = await audioAnalyzer.loadAudioFromUrl(audioPlayer.src);
        songData.audioBuffer = audioBuffer;
        
        // 分析音频数据提取音高信息
        songData.noteData = await audioAnalyzer.analyzeAudio(audioBuffer);
        songData.isAnalyzed = true;
        
        feedbackMessage.textContent = `分析完成，检测到 ${songData.noteData.length} 个音符`;
        
        // 可以在这里添加显示分析结果的代码
        console.log('歌曲分析结果:', songData.noteData);
    } catch (error) {
        feedbackMessage.textContent = '分析歌曲时出错: ' + error.message;
        console.error('分析歌曲错误:', error);
    } finally {
        analyzeButton.disabled = false;
    }
}

// 当页面加载完成时初始化应用
window.addEventListener('load', initApp);

// 调用X.AI API的函数
async function callXaiApi() {
    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer xai-wi6h6wj3nwSGkfgyir98oye2WQumtkiKB1dEFVViCL11XN8PncS6VNhcOicAinC1rbJC9hEXnYMtoc3v'
            },
            body: JSON.stringify({
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a singing coach assistant."
                    },
                    {
                        "role": "user",
                        "content": "Analyze my singing performance and provide feedback."
                    }
                ],
                "model": "grok-2-latest",
                "stream": false,
                "temperature": 0
            })
        });
        
        const data = await response.json();
        console.log('X.AI API Response:', data);
        return data;
    } catch (error) {
        console.error('Error calling X.AI API:', error);
        return null;
    }
}

// 示例：如何使用X.AI API（可以在适当的地方调用）
// callXaiApi().then(result => {
//     if (result && result.choices && result.choices.length > 0) {
//         const aiResponse = result.choices[0].message.content;
//         console.log('AI Feedback:', aiResponse);
//     }
// });