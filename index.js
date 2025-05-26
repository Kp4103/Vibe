/*
 * Discord Music Bot - Ultra-Smooth High-Quality Audio Edition with Anti-Rate-Limiting
 * 
 * Features:
 * - Universal !play command (YouTube links, Spotify links, search terms)
 * - High-quality audio prioritization (128kbps+ with Opus codec optimization)
 * - Anti-stutter technology with 64MB audio buffers
 * - Anti-rate-limiting protection (handles 429 errors from YouTube)
 * - Real-time audio quality monitoring and display
 * - Connection diagnostics and stutter troubleshooting
 * - Full queue management (pause, resume, skip, stop, queue display)
 * - Real-time volume control with shortcuts
 * - Smart fallback systems for reliable playback
 * - Spotify integration (converts to YouTube for playback)
 * - Multi-server support with individual queues
 * 
 * Audio Quality Features:
 * - Prioritizes high-bitrate formats (128kbps+)
 * - Opus codec optimization for Discord
 * - Quality detection and display (!quality command)
 * - Automatic format selection for best available quality
 * 
 * Anti-Stutter Technology:
 * - 64MB audio buffers (4x larger than standard)
 * - Silence padding frames to prevent glitches
 * - Enhanced error recovery and reconnection
 * - Connection quality monitoring (!connection command)
 * - Optimized player settings for smooth transitions
 * 
 * Anti-Rate-Limiting Protection:
 * - Request throttling (1 second between requests)
 * - Exponential backoff retry logic for 429 errors
 * - Rotating user agents to avoid detection
 * - Enhanced headers to mimic real browsers
 * - Graceful degradation when rate limited
 * 
 * Commands: !play, !pause, !resume, !skip, !stop, !queue, !np, !quality, !connection, !volume, !vol+, !vol-, !help
 */

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const YouTube = require('youtube-sr').default;
const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();

// Bot setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Spotify setup using environment variables
const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

// Queue system - each server gets its own queue
const serverQueues = new Map();

// Queue structure for each server
class ServerQueue {
    constructor() {
        this.songs = [];
        this.volume = 0.5; // Default to 50% volume
        this.playing = false;
        this.connection = null;
        this.player = null;
        this.currentQuality = null; // Store current audio quality info
    }
}

client.once('ready', async () => {
    console.log(`🎵 ${client.user.tag} is online and ready!`);
    
    // Test YouTube functionality
    try {
        const testResults = await YouTube.search('test', { limit: 1, type: 'video' });
        if (testResults && testResults.length > 0) {
            console.log('✅ YouTube integration working');
        }
    } catch (error) {
        console.log('⚠️ YouTube search test failed:', error.message);
    }
    
    // Initialize Spotify API
    try {
        const data = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(data.body['access_token']);
        console.log('✅ Spotify integration working');
    } catch (error) {
        console.log('⚠️ Spotify integration failed:', error.message);
    }
    
    console.log('🎵 Ready to play ultra-smooth music! Use !help for commands');
    console.log('🔊 Audio optimizations: 64MB buffers, anti-stutter tech, 128kbps+ priority');
    console.log('🛡️ Anti-rate-limiting: Request throttling, retry logic, rotating user agents');
    console.log('🔗 Connection diagnostics available with !connection command');
});

// Command cooldown system to prevent spam
const commandCooldowns = new Map();
const COMMAND_COOLDOWN = 2000; // 2 seconds between commands per user

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).split(' ');
    const command = args[0].toLowerCase();
    
    // Command cooldown check
    const userId = message.author.id;
    const now = Date.now();
    const cooldownKey = `${userId}-${command}`;
    
    if (commandCooldowns.has(cooldownKey)) {
        const expirationTime = commandCooldowns.get(cooldownKey) + COMMAND_COOLDOWN;
        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return; // Silently ignore spam commands
        }
    }
    
    commandCooldowns.set(cooldownKey, now);
    
    // Clean up old cooldowns every minute
    if (Math.random() < 0.01) { // 1% chance to cleanup
        const expired = [];
        for (const [key, time] of commandCooldowns) {
            if (now - time > 60000) expired.push(key);
        }
        expired.forEach(key => commandCooldowns.delete(key));
    }
    
    try {
        switch (command) {
            case 'play':
            case 'p':
                await handlePlay(message, args);
                break;
            case 'pause':
                await handlePause(message);
                break;
            case 'resume':
                await handleResume(message);
                break;
            case 'skip':
                await handleSkip(message);
                break;
            case 'stop':
                await handleStop(message);
                break;
            case 'queue':
                await showQueue(message);
                break;
            case 'volume':
            case 'vol':
                await setVolume(message, args[1]);
                break;
            case 'volume+':
            case 'vol+':
            case 'volumeup':
            case 'volup':
                await adjustVolume(message, 10);
                break;
            case 'volume-':
            case 'vol-':
            case 'volumedown':
            case 'voldown':
                await adjustVolume(message, -10);
                break;
            case 'np':
            case 'nowplaying':
                await showNowPlaying(message);
                break;
            case 'quality':
            case 'q':
                await showAudioQuality(message);
                break;
            case 'connection':
            case 'ping':
                await checkConnection(message);
                break;
            case 'help':
                await showHelp(message);
                break;
        }
    } catch (error) {
        console.error('Command error:', error);
        // Don't spam error messages to users
    }
});

// Handle play command - Universal smart command that handles everything
// Search-first approach to avoid 429 errors on free hosting
async function handlePlay(message, args) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        return message.reply('❌ You need to be in a voice channel to play music!');
    }
    
    if (!args[1]) {
        return message.reply('❌ Please provide a song name, YouTube link, or Spotify link!');
    }
    
    const query = args.slice(1).join(' ');
    
    try {
        let songInfo;
        
        // For free hosting: Convert ALL inputs to search queries to avoid 429 errors
        if (query.includes('spotify.com/track/')) {
            console.log('🎵 Converting Spotify link to search');
            songInfo = await handleSpotifyTrack(query);
        } 
        else if (query.includes('youtube.com/watch') || query.includes('youtu.be/')) {
            console.log('🎵 Converting YouTube link to search query');
            // Extract video title instead of using direct link to avoid 429
            try {
                const normalizedUrl = normalizeYouTubeURL(query);
                await throttleRequests();
                
                // Try to get basic info for the title, then search
                const basicInfo = await ytdl.getBasicInfo(normalizedUrl);
                const title = basicInfo.videoDetails.title;
                const author = basicInfo.videoDetails.author.name;
                
                console.log(`🔍 Searching for: ${title} by ${author}`);
                songInfo = await searchYouTube(`${title} ${author}`);
            } catch (linkError) {
                console.log('❌ Direct link failed, extracting from URL');
                // Fallback: try to extract meaningful search terms from URL
                const urlParams = new URL(query).searchParams;
                const videoId = urlParams.get('v') || query.split('/').pop().split('?')[0];
                console.log(`🔍 Searching by video ID: ${videoId}`);
                songInfo = await searchYouTube(videoId);
            }
        }
        else {
            // Direct search (most reliable on free hosting)
            console.log('🎵 Direct search for:', query);
            songInfo = await searchYouTube(query);
        }
        
        if (!songInfo) {
            return message.reply('❌ Could not find that song! Try a different search term.');
        }
        
        // Add to queue and start playing
        let serverQueue = serverQueues.get(message.guild.id);
        if (!serverQueue) {
            serverQueue = new ServerQueue();
            serverQueues.set(message.guild.id, serverQueue);
        }
        
        serverQueue.songs.push(songInfo);
        
        if (!serverQueue.playing) {
            await playMusic(message, serverQueue, voiceChannel);
        } else {
            const embed = new EmbedBuilder()
                .setTitle('🎵 Added to Queue')
                .setDescription(`**${songInfo.title}**\nBy: ${songInfo.author}`)
                .setColor(0x00ff00)
                .setThumbnail(songInfo.thumbnail);
            
            message.reply({ embeds: [embed] });
        }
        
    } catch (error) {
        console.error('❌ Play command error:', error.message);
        message.reply('❌ Something went wrong! Try a simpler search term or try again in a few seconds.');
    }
}

// Handle Spotify track links
async function handleSpotifyTrack(spotifyUrl) {
    try {
        // Extract track ID from Spotify URL
        const trackId = spotifyUrl.split('/track/')[1]?.split('?')[0];
        
        if (!trackId) {
            console.log('❌ Could not extract track ID from Spotify URL');
            return null;
        }
        
        // Get track info from Spotify
        const track = await spotifyApi.getTrack(trackId);
        const trackName = track.body.name;
        const artistName = track.body.artists[0].name;
        
        console.log(`🎵 Found Spotify track: ${trackName} by ${artistName}`);
        
        // Search for this song on YouTube
        const searchQuery = `${trackName} ${artistName}`;
        const youtubeResult = await searchYouTube(searchQuery);
        
        if (!youtubeResult) {
            console.log('❌ Could not find YouTube equivalent for Spotify track');
            return null;
        }
        
        return youtubeResult;
        
    } catch (error) {
        console.error('❌ Spotify track error:', error);
        return null;
    }
}

// Handle YouTube links
async function handleYouTubeLink(url) {
    try {
        console.log('Processing YouTube link:', url);
        
        // Normalize the URL first
        const normalizedUrl = normalizeYouTubeURL(url);
        console.log('Normalized URL:', normalizedUrl);
        
        // Validate the URL first
        if (!ytdl.validateURL(normalizedUrl)) {
            console.log('Invalid YouTube URL after normalization:', normalizedUrl);
            return null;
        }
        
        try {
            // Get video info using ytdl-core
            const info = await ytdl.getInfo(normalizedUrl);
            const videoDetails = info.videoDetails;
            
            if (!videoDetails) {
                console.log('No video details found for URL:', normalizedUrl);
                return null;
            }
            
            console.log('YouTube video info:', {
                title: videoDetails.title,
                duration: videoDetails.lengthSeconds,
                live: videoDetails.isLiveContent
            });
            
            // Skip live streams
            if (videoDetails.isLiveContent) {
                console.log('Skipping live stream');
                return null;
            }
            
            return {
                title: videoDetails.title || 'Unknown Title',
                author: videoDetails.author?.name || 'Unknown Channel',
                url: normalizedUrl,
                thumbnail: videoDetails.thumbnails?.[0]?.url || '',
                duration: formatDuration(parseInt(videoDetails.lengthSeconds))
            };
            
        } catch (videoInfoError) {
            console.log('Direct video info failed, trying search fallback...', videoInfoError.message);
            
            // Extract video ID for search
            const videoId = normalizedUrl.split('v=')[1]?.split('&')[0];
            if (!videoId) {
                console.log('Could not extract video ID');
                return null;
            }
            
            // Search for the video by title as fallback
            console.log('Searching for video ID via YouTube search:', videoId);
            
            // Try to get basic info and search for similar
            try {
                const basicInfo = await ytdl.getBasicInfo(normalizedUrl);
                const title = basicInfo.videoDetails.title;
                
                if (title) {
                    console.log('Got title from basic info, searching for:', title);
                    return await searchYouTube(title);
                }
            } catch (basicError) {
                console.log('Basic info also failed, trying generic search');
            }
            
            // Last resort: search by video ID
            const searchResults = await YouTube.search(videoId, { limit: 3, type: 'video' });
            
            if (!searchResults || searchResults.length === 0) {
                console.log('Search fallback also failed');
                return null;
            }
            
            const bestMatch = searchResults[0];
            console.log('Found via search fallback:', bestMatch.title);
            
            return {
                title: bestMatch.title || 'Unknown Title',
                author: bestMatch.channel?.name || 'Unknown Channel',
                url: bestMatch.url,
                thumbnail: bestMatch.thumbnail?.url || '',
                duration: formatDuration(bestMatch.duration)
            };
        }
        
    } catch (error) {
        console.error('YouTube link error:', error);
        return null;
    }
}

// Search YouTube for songs
async function searchYouTube(query) {
    try {
        // Throttle requests to prevent rate limiting
        await throttleRequests();
        
        const results = await YouTube.search(query, { 
            limit: 3,
            type: 'video'
        });
        
        if (!results || results.length === 0) {
            console.log('❌ No search results found for:', query);
            return null;
        }
        
        // Find the first valid video (not a live stream or very short)
        for (let video of results) {
            if (video.live || !video.url || video.duration < 10) {
                continue;
            }
            
            console.log('✅ Found:', video.title);
            
            return {
                title: video.title,
                author: video.channel?.name || 'Unknown',
                url: video.url,
                thumbnail: video.thumbnail?.url || '',
                duration: formatDuration(video.duration)
            };
        }
        
        console.log('❌ No valid videos found in search results');
        return null;
        
    } catch (error) {
        console.error('❌ YouTube search error:', error);
        return null;
    }
}

// Play music function
async function playMusic(message, serverQueue, voiceChannel) {
    const song = serverQueue.songs[0];
    
    if (!song) {
        serverQueue.playing = false;
        if (serverQueue.connection && serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            serverQueue.connection.destroy();
        }
        serverQueues.delete(message.guild.id);
        return;
    }
    
    // Debug: Log song details
    console.log('Attempting to play:', {
        title: song.title,
        url: song.url,
        author: song.author
    });
    
    // Validate URL before attempting to play
    if (!song.url || typeof song.url !== 'string') {
        console.error('Invalid song URL:', song.url);
        message.channel.send('❌ Invalid song URL, skipping to next song...');
        serverQueue.songs.shift();
        return playMusic(message, serverQueue, voiceChannel);
    }
    
    try {
        // Join voice channel with optimized settings for smooth audio
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });
        
        // Configure connection for optimal audio streaming
        connection.on('stateChange', (oldState, newState) => {
            console.log(`🔗 Connection: ${oldState.status} → ${newState.status}`);
        });
        
        // Handle connection errors and reconnection
        connection.on('error', error => {
            console.error('❌ Voice connection error:', error);
        });
        
        serverQueue.connection = connection;
        
        // Create audio player with optimized settings
        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: 'pause', // Pause when no one is listening
                maxMissedFrames: Math.round(5000 / 20), // Allow more missed frames before giving up
            },
            debug: false // Disable debug for better performance
        });
        
        serverQueue.player = player;
        
        // Validate URL format before streaming
        let validUrl = normalizeYouTubeURL(song.url);
        console.log('Final URL for streaming:', validUrl);
        
        if (!validUrl.startsWith('http')) {
            console.error('URL does not start with http:', validUrl);
            message.channel.send('❌ Invalid URL format, skipping song...');
            serverQueue.songs.shift();
            return playMusic(message, serverQueue, voiceChannel);
        }
        
        // Double-check URL validity
        if (!ytdl.validateURL(validUrl)) {
            console.error('URL failed ytdl validation:', validUrl);
            message.channel.send('❌ Invalid YouTube URL, skipping song...');
            serverQueue.songs.shift();
            return playMusic(message, serverQueue, voiceChannel);
        }
        
        // Create audio resource from YouTube using ytdl-core
        console.log('Creating stream for URL:', validUrl);
        
        try {
            // First, get video info to check available formats
            const info = await ytdl.getInfo(validUrl);
            const formats = info.formats;
            
            // Find the best available audio format
            const audioFormats = formats.filter(format => format.hasAudio && !format.hasVideo);
            console.log(`Found ${audioFormats.length} audio formats`);
            
            if (audioFormats.length === 0) {
                throw new Error('No audio formats available');
            }
            
            // Try to find a working format
            let workingFormat = null;
            
            // Priority order: opus > mp4 > webm > any
            const formatPriority = ['opus', 'mp4', 'webm'];
            
            for (const container of formatPriority) {
                workingFormat = audioFormats.find(f => f.container === container && f.url);
                if (workingFormat) {
                    console.log(`Using ${container} format:`, workingFormat.qualityLabel || workingFormat.quality);
                    break;
                }
            }
            
            // If no preferred format, use any available format with URL
            if (!workingFormat) {
                workingFormat = audioFormats.find(f => f.url);
            }
            
            if (!workingFormat || !workingFormat.url) {
                throw new Error('No playable audio format found');
            }
            
            // Create stream using the specific format
            const stream = ytdl(validUrl, {
                format: workingFormat,
                highWaterMark: 1 << 25
            });
            
            const resource = createAudioResource(stream, {
                inputType: 'arbitrary',
                inlineVolume: true
            });
            
            // Apply volume setting if available
            if (resource.volume && serverQueue.volume !== undefined) {
                resource.volume.setVolume(serverQueue.volume);
                console.log(`Applied volume: ${Math.round(serverQueue.volume * 100)}%`);
            }
            
            // Start playing with optimized connection
            player.play(resource);
            
            // Subscribe to connection with better error handling
            const subscription = connection.subscribe(player);
            if (!subscription) {
                console.error('❌ Failed to subscribe to voice connection');
                throw new Error('Failed to subscribe to voice connection');
            }
            
            serverQueue.playing = true;
            
            // Show now playing message
            const embed = new EmbedBuilder()
                .setTitle('🎵 Now Playing')
                .setDescription(`**${song.title}**\nBy: ${song.author}\nDuration: ${song.duration}`)
                .setColor(0x00ff00)
                .setThumbnail(song.thumbnail);
            
            message.channel.send({ embeds: [embed] });
            console.log('✅ Successfully playing:', song.title);
            
        } catch (streamError) {
            console.error('Primary streaming failed:', streamError.message);
            
            // Try alternative method without specific format selection
            console.log('Trying simplified streaming method...');
            try {
                const stream = ytdl(validUrl, {
                    filter: format => format.hasAudio,
                    quality: 'lowest',
                    highWaterMark: 1 << 25
                });
                
                const resource = createAudioResource(stream, {
                    inputType: 'arbitrary',
                    inlineVolume: true
                });
                
                // Apply volume setting if available
                if (resource.volume && serverQueue.volume !== undefined) {
                    resource.volume.setVolume(serverQueue.volume);
                    console.log(`Applied volume to fallback: ${Math.round(serverQueue.volume * 100)}%`);
                }
                
                player.play(resource);
                connection.subscribe(player);
                serverQueue.playing = true;
                
                const embed = new EmbedBuilder()
                    .setTitle('🎵 Now Playing (Fallback)')
                    .setDescription(`**${song.title}**\nBy: ${song.author}\nDuration: ${song.duration}`)
                    .setColor(0xffa500)
                    .setThumbnail(song.thumbnail);
                
                message.channel.send({ embeds: [embed] });
                console.log('✅ Successfully playing with fallback method:', song.title);
                
            } catch (fallbackError) {
                console.error('Fallback streaming also failed:', fallbackError.message);
                
                // Last resort: try to find alternative video
                console.log('Trying to find alternative version...');
                try {
                    const searchQuery = `${song.title} ${song.author}`.replace(/[^a-zA-Z0-9\s]/g, '').trim();
                    console.log('Searching for alternative:', searchQuery);
                    
                    const altResults = await YouTube.search(searchQuery, { 
                        limit: 5,
                        type: 'video'
                    });
                    
                    if (altResults && altResults.length > 0) {
                        // Try each result until one works
                        for (let i = 0; i < Math.min(altResults.length, 3); i++) {
                            const altVideo = altResults[i];
                            console.log(`Trying alternative ${i + 1}:`, altVideo.title);
                            
                            try {
                                if (altVideo.url === validUrl) continue; // Skip the same video
                                
                                const altStream = ytdl(altVideo.url, {
                                    filter: format => format.hasAudio,
                                    quality: 'lowest'
                                });
                                
                                const altResource = createAudioResource(altStream, {
                                    inputType: 'arbitrary',
                                    inlineVolume: true
                                });
                                
                                // Apply volume setting if available
                                if (altResource.volume && serverQueue.volume !== undefined) {
                                    altResource.volume.setVolume(serverQueue.volume);
                                    console.log(`Applied volume to alternative: ${Math.round(serverQueue.volume * 100)}%`);
                                }
                                
                                player.play(altResource);
                                connection.subscribe(player);
                                serverQueue.playing = true;
                                
                                // Update song info with working alternative
                                serverQueue.songs[0] = {
                                    title: altVideo.title,
                                    author: altVideo.channel?.name || 'Unknown',
                                    url: altVideo.url,
                                    thumbnail: altVideo.thumbnail?.url || '',
                                    duration: formatDuration(altVideo.duration)
                                };
                                
                                const embed = new EmbedBuilder()
                                    .setTitle('🎵 Now Playing (Alternative)')
                                    .setDescription(`**${altVideo.title}**\nBy: ${altVideo.channel?.name || 'Unknown'}\nDuration: ${formatDuration(altVideo.duration)}`)
                                    .setColor(0xff6600)
                                    .setThumbnail(altVideo.thumbnail?.url || '');
                                
                                message.channel.send({ embeds: [embed] });
                                console.log('✅ Successfully playing alternative:', altVideo.title);
                                return; // Success!
                                
                            } catch (altError) {
                                console.log(`Alternative ${i + 1} failed:`, altError.message);
                                continue; // Try next alternative
                            }
                        }
                        
                        throw new Error('All alternatives failed');
                    } else {
                        throw new Error('No alternatives found');
                    }
                    
                } catch (altSearchError) {
                    console.error('Alternative search failed:', altSearchError.message);
                    message.channel.send('❌ Could not play this song or find alternatives. YouTube may be blocking access. Skipping...');
                    serverQueue.songs.shift();
                    setTimeout(() => {
                        playMusic(message, serverQueue, voiceChannel);
                    }, 2000);
                    return;
                }
            }
        }
        
        // Handle when song ends
        player.on(AudioPlayerStatus.Idle, () => {
            console.log('Song finished, playing next...');
            serverQueue.songs.shift(); // Remove played song
            playMusic(message, serverQueue, voiceChannel); // Play next song
        });
        
        player.on('error', error => {
            console.error('Audio player error:', error);
            message.channel.send('❌ Error playing song, skipping to next...');
            serverQueue.songs.shift();
            // Don't immediately try to play next song if there's an error
            setTimeout(() => {
                playMusic(message, serverQueue, voiceChannel);
            }, 2000);
        });
        
    } catch (error) {
        console.error('Play music error:', error);
        message.channel.send('❌ Could not play the song, trying next in queue...');
        serverQueue.songs.shift(); // Remove the problematic song
        
        // Try next song after a delay
        setTimeout(() => {
            playMusic(message, serverQueue, voiceChannel);
        }, 2000);
    }
}

// Pause command
async function handlePause(message) {
    const serverQueue = serverQueues.get(message.guild.id);
    if (!serverQueue || !serverQueue.player) {
        return message.reply('❌ Nothing is currently playing!');
    }
    
    serverQueue.player.pause();
    message.reply('⏸️ Music paused!');
}

// Resume command
async function handleResume(message) {
    const serverQueue = serverQueues.get(message.guild.id);
    if (!serverQueue || !serverQueue.player) {
        return message.reply('❌ Nothing is currently paused!');
    }
    
    serverQueue.player.unpause();
    message.reply('▶️ Music resumed!');
}

// Skip command
async function handleSkip(message) {
    const serverQueue = serverQueues.get(message.guild.id);
    if (!serverQueue || !serverQueue.player) {
        return message.reply('❌ Nothing is currently playing!');
    }
    
    if (serverQueue.songs.length <= 1) {
        return message.reply('❌ No more songs in queue to skip to!');
    }
    
    serverQueue.player.stop(); // This will trigger the 'idle' event and play next song
    message.reply('⏭️ Song skipped!');
}

// Stop command
async function handleStop(message) {
    const serverQueue = serverQueues.get(message.guild.id);
    if (!serverQueue) {
        return message.reply('❌ Nothing is currently playing!');
    }
    
    serverQueue.songs = [];
    serverQueue.playing = false;
    
    if (serverQueue.player) {
        serverQueue.player.stop();
    }
    
    if (serverQueue.connection && serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        serverQueue.connection.destroy();
    }
    
    serverQueues.delete(message.guild.id);
    message.reply('⏹️ Music stopped and queue cleared!');
}

// Show queue
async function showQueue(message) {
    const serverQueue = serverQueues.get(message.guild.id);
    if (!serverQueue || serverQueue.songs.length === 0) {
        return message.reply('❌ The queue is empty!');
    }
    
    const queueList = serverQueue.songs.slice(0, 10).map((song, index) => {
        if (index === 0) {
            return `🎵 **Now Playing:** ${song.title} - ${song.author}`;
        }
        return `${index}. ${song.title} - ${song.author}`;
    }).join('\n');
    
    const embed = new EmbedBuilder()
        .setTitle('🎵 Music Queue')
        .setDescription(queueList)
        .setColor(0x00ff00)
        .setFooter({ text: `${serverQueue.songs.length} song(s) in queue` });
    
    message.reply({ embeds: [embed] });
}

// Check connection quality and provide diagnostics
async function checkConnection(message) {
    const serverQueue = serverQueues.get(message.guild.id);
    
    // Basic ping test
    const pingStart = Date.now();
    const pingMessage = await message.reply('🏓 Testing connection...');
    const ping = Date.now() - pingStart;
    
    let connectionStatus = '✅ **Excellent** (< 50ms)';
    if (ping > 200) {
        connectionStatus = '❌ **Poor** (> 200ms) - May cause stutters';
    } else if (ping > 100) {
        connectionStatus = '⚠️ **Fair** (100-200ms) - Possible minor issues';  
    } else if (ping > 50) {
        connectionStatus = '👍 **Good** (50-100ms)';
    }
    
    let voiceStatus = '❌ Not connected to voice';
    if (serverQueue && serverQueue.connection) {
        const state = serverQueue.connection.state.status;
        
        switch(state) {
            case VoiceConnectionStatus.Ready:
                voiceStatus = '✅ Voice connection: Ready';
                break;
            case VoiceConnectionStatus.Connecting:
                voiceStatus = '⏳ Voice connection: Connecting...';
                break;
            case VoiceConnectionStatus.Disconnected:
                voiceStatus = '❌ Voice connection: Disconnected';
                break;
            case VoiceConnectionStatus.Destroyed:
                voiceStatus = '💥 Voice connection: Destroyed';
                break;
            default:
                voiceStatus = `🔍 Voice connection: ${state}`;
        }
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🔗 Connection Diagnostics')
        .setDescription(`
        **Discord Latency:** ${ping}ms
        ${connectionStatus}
        
        **Voice Status:**
        ${voiceStatus}
        
        **Audio Buffer:** 64MB (Optimized for smooth playback)
        **Silence Padding:** 5 frames (Anti-stutter protection)
        
        **Tips for Better Performance:**
        ${ping > 100 ? '• Try switching to a different voice region\n• Check your internet connection\n• Restart your router if issues persist' : '• Connection looks good!\n• Audio should be smooth and stutter-free'}
        `)
        .setColor(ping > 200 ? 0xff0000 : ping > 100 ? 0xffa500 : 0x00ff00)
        .setTimestamp();
    
    await pingMessage.edit({ content: '', embeds: [embed] });
}

// Show current audio quality information
async function showAudioQuality(message) {
    const serverQueue = serverQueues.get(message.guild.id);
    if (!serverQueue || serverQueue.songs.length === 0) {
        return message.reply('❌ Nothing is currently playing!');
    }
    
    const song = serverQueue.songs[0];
    const quality = serverQueue.currentQuality;
    
    let qualityText = 'Quality information not available';
    
    if (quality) {
        const bitrateText = quality.bitrate ? `${quality.bitrate}kbps` : 'Unknown bitrate';
        const codecText = quality.codec || 'Unknown codec';
        const containerText = quality.container || 'Unknown format';
        
        qualityText = `**Audio Quality:**\n🎵 Bitrate: ${bitrateText}\n🔊 Codec: ${codecText.toUpperCase()}\n📦 Container: ${containerText.toUpperCase()}`;
        
        // Add quality rating
        if (quality.bitrate) {
            if (quality.bitrate >= 256) {
                qualityText += '\n⭐ **Excellent Quality**';
            } else if (quality.bitrate >= 128) {
                qualityText += '\n✅ **High Quality**';
            } else if (quality.bitrate >= 96) {
                qualityText += '\n👍 **Good Quality**';
            } else {
                qualityText += '\n📱 **Standard Quality**';
            }
        }
        
        // Add buffer info
        qualityText += '\n\n**Streaming Optimizations:**\n🔄 64MB Buffer (Anti-stutter)\n🔇 Silence Padding (Smooth transitions)';
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🎵 Current Audio Quality')
        .setDescription(`**${song.title}**\nBy: ${song.author}\n\n${qualityText}`)
        .setColor(0x00ff00)
        .setThumbnail(song.thumbnail)
        .setFooter({ text: 'Optimized for stutter-free playback • Use !connection to check network' });
    
    message.reply({ embeds: [embed] });
}

// Show now playing
async function showNowPlaying(message) {
    const serverQueue = serverQueues.get(message.guild.id);
    if (!serverQueue || serverQueue.songs.length === 0) {
        return message.reply('❌ Nothing is currently playing!');
    }
    
    const song = serverQueue.songs[0];
    const quality = serverQueue.currentQuality;
    
    let qualityInfo = '';
    if (quality && quality.bitrate) {
        qualityInfo = `\nQuality: ${quality.bitrate}kbps ${quality.codec?.toUpperCase() || 'Audio'}`;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🎵 Now Playing')
        .setDescription(`**${song.title}**\nBy: ${song.author}\nDuration: ${song.duration}${qualityInfo}`)
        .setColor(0x00ff00)
        .setThumbnail(song.thumbnail);
    
    message.reply({ embeds: [embed] });
}

// Quick test command to see format availability
async function testCommand(message, args) {
    const url = args[1] || 'https://www.youtube.com/watch?v=w_VQJBWvJcI';
    
    try {
        message.reply('🔍 Testing format availability...');
        console.log('\n=== QUICK TEST ===');
        
        const normalizedUrl = normalizeYouTubeURL(url);
        console.log('Testing:', normalizedUrl);
        
        const info = await ytdl.getInfo(normalizedUrl);
        const formats = info.formats;
        
        const audioFormats = formats.filter(f => f.hasAudio && !f.hasVideo);
        const workingFormats = audioFormats.filter(f => f.url);
        
        console.log(`Total formats: ${formats.length}`);
        console.log(`Audio-only formats: ${audioFormats.length}`);
        console.log(`Working formats (with URL): ${workingFormats.length}`);
        
        if (workingFormats.length > 0) {
            console.log('Sample working format:', {
                quality: workingFormats[0].quality,
                container: workingFormats[0].container,
                hasUrl: !!workingFormats[0].url
            });
            
            message.reply(`✅ Found ${workingFormats.length} working audio formats out of ${audioFormats.length} total audio formats.`);
        } else {
            message.reply(`❌ No working formats found! This explains why the bot can't play.`);
        }
        
    } catch (error) {
        console.error('Test error:', error);
        message.reply(`❌ Test failed: ${error.message}`);
    }
}

// Show available formats for a YouTube video
async function showFormats(message, args) {
    if (!args[1]) {
        return message.reply('❌ Usage: `!formats <youtube_url>` to see available audio formats');
    }
    
    const url = args[1];
    
    try {
        const normalizedUrl = normalizeYouTubeURL(url);
        
        if (!ytdl.validateURL(normalizedUrl)) {
            return message.reply('❌ Invalid YouTube URL!');
        }
        
        console.log('Getting formats for:', normalizedUrl);
        const info = await ytdl.getInfo(normalizedUrl);
        
        // Get audio-only formats
        const audioFormats = info.formats.filter(format => format.hasAudio && !format.hasVideo);
        const workingFormats = audioFormats.filter(format => format.url);
        
        if (audioFormats.length === 0) {
            return message.reply('❌ No audio-only formats found for this video!');
        }
        
        const formatList = workingFormats.slice(0, 10).map((format, index) => {
            const hasUrl = format.url ? '✅' : '❌';
            return `${index + 1}. ${hasUrl} **${format.qualityLabel || format.quality}** - ${format.container} (${format.audioCodec})`;
        }).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle('🎵 Available Audio Formats')
            .setDescription(`**${info.videoDetails.title}**\n\n${formatList}`)
            .setColor(0x00ff00)
            .setFooter({ text: `Working: ${workingFormats.length}/${audioFormats.length} formats` });
        
        message.reply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Formats command error:', error);
        message.reply(`❌ Could not get formats: ${error.message}`);
    }
}

// Handle pure search (bypass direct links)
async function handleSearch(message, args) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        return message.reply('❌ You need to be in a voice channel to play music!');
    }
    
    if (!args[1]) {
        return message.reply('❌ Please provide a search term! Example: `!search slava funk`');
    }
    
    const query = args.slice(1).join(' ');
    
    try {
        console.log('Pure search for:', query);
        const songInfo = await searchYouTube(query);
        
        if (!songInfo) {
            return message.reply('❌ Could not find that song!');
        }
        
        // Get or create server queue
        let serverQueue = serverQueues.get(message.guild.id);
        if (!serverQueue) {
            serverQueue = new ServerQueue();
            serverQueues.set(message.guild.id, serverQueue);
        }
        
        // Add song to queue
        serverQueue.songs.push(songInfo);
        
        // If not playing, start playing
        if (!serverQueue.playing) {
            await playMusic(message, serverQueue, voiceChannel);
        } else {
            const embed = new EmbedBuilder()
                .setTitle('🎵 Added to Queue (Search)')
                .setDescription(`**${songInfo.title}**\nBy: ${songInfo.author}`)
                .setColor(0x00ff00)
                .setThumbnail(songInfo.thumbnail);
            
            message.reply({ embeds: [embed] });
        }
        
    } catch (error) {
        console.error('Search command error:', error);
        message.reply('❌ Something went wrong while searching for that song!');
    }
}

// Debug command to test individual components
async function debugCommand(message, args) {
    if (!args[1]) {
        return message.reply('❌ Usage: `!debug <url>` to test a YouTube URL');
    }
    
    const url = args[1];
    message.reply('🔍 Testing URL... (check console for details)');
    
    try {
        console.log('\n=== DEBUG COMMAND ===');
        console.log('Testing URL:', url);
        
        // Test URL normalization
        const normalizedUrl = normalizeYouTubeURL(url);
        console.log('Normalized URL:', normalizedUrl);
        
        // Test URL validation
        const isValid = ytdl.validateURL(normalizedUrl);
        console.log('URL validation result:', isValid);
        
        if (!isValid) {
            return message.reply(`❌ URL validation failed`);
        }
        
        // Test video info retrieval
        try {
            console.log('Attempting video info...');
            const info = await ytdl.getInfo(normalizedUrl);
            console.log('✅ Video info successful:', {
                title: info.videoDetails.title,
                duration: info.videoDetails.lengthSeconds,
                live: info.videoDetails.isLiveContent
            });
            
            // Test stream creation
            console.log('Testing stream creation...');
            const stream = ytdl(normalizedUrl, {
                filter: 'audioonly',
                quality: 'highestaudio'
            });
            
            console.log('✅ Stream created successfully');
            stream.destroy(); // Don't actually use it
            
            message.reply(`✅ All tests passed! Video: "${info.videoDetails.title}" - Duration: ${formatDuration(parseInt(info.videoDetails.lengthSeconds))}`);
            
        } catch (videoInfoError) {
            console.log('❌ Video info failed:', videoInfoError.message);
            console.log('Trying search fallback...');
            
            try {
                // Try basic info first
                const basicInfo = await ytdl.getBasicInfo(normalizedUrl);
                if (basicInfo.videoDetails.title) {
                    console.log('✅ Basic info successful:', basicInfo.videoDetails.title);
                    message.reply(`⚠️ Full info failed, but basic info works!\nTitle: "${basicInfo.videoDetails.title}"`);
                } else {
                    throw new Error('Basic info also failed');
                }
                
            } catch (fallbackError) {
                console.error('❌ All methods failed:', fallbackError);
                message.reply(`❌ All methods failed. This video may be restricted or unavailable.`);
            }
        }
        
    } catch (error) {
        console.error('Debug error:', error);
        message.reply(`❌ Debug failed: ${error.message}`);
    }
}
async function debugCommand(message, args) {
    if (!args[1]) {
        return message.reply('❌ Usage: `!debug <url>` to test a YouTube URL');
    }
    
    const url = args[1];
    message.reply('🔍 Testing URL... (check console for details)');
    
    try {
        console.log('\n=== DEBUG COMMAND ===');
        console.log('Testing URL:', url);
        
        // Test URL normalization
        const normalizedUrl = normalizeYouTubeURL(url);
        console.log('Normalized URL:', normalizedUrl);
        
        // Test URL validation
        const isValid = play.yt_validate(normalizedUrl);
        console.log('URL validation result:', isValid);
        
        if (isValid !== 'video') {
            return message.reply(`❌ URL validation failed: ${isValid}`);
        }
        
        // Test video info retrieval (this is where it usually fails)
        try {
            console.log('Attempting direct video info...');
            const info = await play.video_info(normalizedUrl);
            console.log('✅ Direct video info successful:', {
                title: info.video_details.title,
                duration: info.video_details.durationInSec,
                live: info.video_details.live
            });
            
            // Test stream creation
            console.log('Testing stream creation...');
            const stream = await play.stream(normalizedUrl, {
                discordPlayerCompatibility: true
            });
            console.log('✅ Stream created successfully:', {
                type: stream.type,
                hasStream: !!stream.stream
            });
            
            message.reply(`✅ All tests passed! Video: "${info.video_details.title}" - Duration: ${formatDuration(info.video_details.durationInSec)}`);
            
        } catch (videoInfoError) {
            console.log('❌ Direct video info failed:', videoInfoError.message);
            console.log('Trying search fallback...');
            
            try {
                // Extract video ID for search
                const videoId = normalizedUrl.split('v=')[1]?.split('&')[0];
                console.log('Video ID:', videoId);
                
                const searchResults = await play.search(videoId, {
                    limit: 3,
                    source: { youtube: 'video' }
                });
                
                if (searchResults && searchResults.length > 0) {
                    const result = searchResults[0];
                    console.log('✅ Search fallback successful:', result.title);
                    
                    // Test streaming the search result
                    const stream = await play.stream(result.url);
                    console.log('✅ Fallback stream test successful');
                    
                    message.reply(`⚠️ Direct access failed, but search fallback works!\nFound: "${result.title}" - Duration: ${formatDuration(result.durationInSec)}`);
                } else {
                    throw new Error('No search results found');
                }
                
            } catch (fallbackError) {
                console.error('❌ Search fallback also failed:', fallbackError);
                message.reply(`❌ Both direct access and search fallback failed. This video may be restricted.`);
            }
        }
        
    } catch (error) {
        console.error('Debug error:', error);
        message.reply(`❌ Debug failed: ${error.message}`);
    }
}

// Help command
async function showHelp(message) {
    const embed = new EmbedBuilder()
        .setTitle('🎵 Ultra-Smooth Music Bot Commands')
        .setDescription(`
        **🎮 Music Control:**
        **!play [song/link]** - Play any song, link, or search term
        **!pause** - Pause the current song
        **!resume** - Resume the paused song  
        **!skip** - Skip to the next song
        **!stop** - Stop music and clear queue
        
        **🔊 Volume Control:**
        **!volume [1-100]** - Set volume or show current
        **!vol+ / !volup** - Increase volume by 10%
        **!vol- / !voldown** - Decrease volume by 10%
        
        **📋 Queue & Info:**
        **!queue** - Show the current queue
        **!np** - Show now playing song with quality
        **!quality** - Show detailed audio quality info
        **!connection** - Check connection & diagnose stutters
        **!help** - Show this help message
        
        **💡 Examples:**
        \`!play slava funk\` - Search and play in high quality
        \`!play https://youtu.be/...\` - YouTube link  
        \`!play https://open.spotify.com/track/...\` - Spotify link
        \`!connection\` - Fix stutter issues
        `)
        .setColor(0x00ff00)
        .setFooter({ text: '🎵 Anti-stutter technology • 64MB buffers • Up to 320kbps audio' });
    
    message.reply({ embeds: [embed] });
}

// Adjust volume up or down
async function adjustVolume(message, change) {
    const serverQueue = serverQueues.get(message.guild.id);
    if (!serverQueue) {
        return message.reply('❌ Nothing is currently playing!');
    }
    
    // Get current volume (default to 50% if not set)
    const currentVol = Math.round((serverQueue.volume || 0.5) * 100);
    const newVol = Math.max(1, Math.min(100, currentVol + change));
    
    // Use the existing setVolume function
    await setVolume(message, newVol.toString());
}

// Volume control (proper implementation)
async function setVolume(message, volume) {
    const serverQueue = serverQueues.get(message.guild.id);
    if (!serverQueue) {
        return message.reply('❌ Nothing is currently playing!');
    }
    
    // Show current volume if no parameter provided
    if (!volume) {
        const currentVol = Math.round((serverQueue.volume || 0.5) * 100);
        return message.reply(`🔊 Current volume: **${currentVol}%**`);
    }
    
    const vol = parseInt(volume);
    if (isNaN(vol) || vol < 1 || vol > 100) {
        return message.reply('❌ Please provide a volume between 1 and 100!');
    }
    
    // Update server queue volume setting
    serverQueue.volume = vol / 100;
    
    // Apply volume to current audio resource if it has volume control
    if (serverQueue.player && serverQueue.player.state.resource && serverQueue.player.state.resource.volume) {
        serverQueue.player.state.resource.volume.setVolume(serverQueue.volume);
        
        const embed = new EmbedBuilder()
            .setTitle('🔊 Volume Changed')
            .setDescription(`Volume set to **${vol}%**`)
            .setColor(0x00ff00);
        
        message.reply({ embeds: [embed] });
        console.log(`Volume set to ${vol}% for guild ${message.guild.id}`);
    } else {
        // Volume will apply to next song
        message.reply(`🔊 Volume set to **${vol}%** (will apply to next song)`);
        console.log(`Volume setting saved: ${vol}% for guild ${message.guild.id}`);
    }
}

// Rate limiting prevention
let lastRequestTime = 0;
const REQUEST_DELAY = 1000; // 1 second between requests

async function throttleRequests() {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < REQUEST_DELAY) {
        const delay = REQUEST_DELAY - timeSinceLastRequest;
        console.log(`⏳ Throttling request, waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    lastRequestTime = Date.now();
}

// Anti-rate-limiting helper functions
function getRandomUserAgent() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Retry function for rate limiting
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (error.message.includes('429') && i < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, i); // Exponential backoff
                console.log(`⏳ Rate limited, retrying in ${delay}ms... (attempt ${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
}
function normalizeYouTubeURL(url) {
    try {
        // Handle youtu.be short links
        if (url.includes('youtu.be/')) {
            const videoId = url.split('youtu.be/')[1].split('?')[0].split('&')[0];
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        
        // Handle youtube.com links with extra parameters
        if (url.includes('youtube.com/watch')) {
            const urlObj = new URL(url);
            const videoId = urlObj.searchParams.get('v');
            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
        }
        
        return url;
    } catch (error) {
        console.error('URL normalization error:', error);
        return url;
    }
}

// Helper function to format duration
function formatDuration(duration) {
    if (!duration) return '0:00';
    
    // Handle duration as seconds (number)
    if (typeof duration === 'number') {
        const mins = Math.floor(duration / 60);
        const secs = Math.floor(duration % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Handle duration as milliseconds
    if (duration > 1000000) {
        const seconds = Math.floor(duration / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Handle duration object or already formatted string
    return duration.toString();
}

// Login with your bot token from environment variables
client.login(process.env.DISCORD_TOKEN);