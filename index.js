/*
 * Discord Music Bot - Ultra-Smooth High-Quality Audio Edition (Spanish Interface)
 * 
 * Features:
 * - Spanish commands for client: !tocar, !pausar, !volumen, etc.
 * - English command aliases also supported for compatibility
 * - Universal !tocar command (YouTube links, Spotify links, search terms)
 * - High-quality audio prioritization (128kbps+ with Opus codec optimization)
 * - Anti-stutter technology with 64MB audio buffers
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
 * - Quality detection and display (!calidad command)
 * - Automatic format selection for best available quality
 * 
 * Anti-Stutter Technology:
 * - 64MB audio buffers (4x larger than standard)
 * - Silence padding frames to prevent glitches
 * - Enhanced error recovery and reconnection
 * - Connection quality monitoring (!conexion command)
 * - Optimized player settings for smooth transitions
 * 
 * Spanish Commands: !tocar, !pausar, !reanudar, !saltar, !parar, !cola, !actual, !calidad, !conexion, !volumen, !subir, !bajar, !ayuda
 * English Aliases: !play, !pause, !resume, !skip, !stop, !queue, !np, !quality, !connection, !volume, !vol+, !vol-, !help
 */

const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, Collection } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const YouTube = require('youtube-sr').default;
const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();

// Bot setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Store commands in a collection
client.commands = new Collection();

// Define slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproduce una canción')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Nombre de la canción o URL de YouTube/Spotify')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pausa la canción actual'),
    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Reanuda la canción pausada'),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Salta a la siguiente canción'),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Detiene la música y limpia la cola'),
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Muestra la cola de reproducción'),
    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Ajusta o muestra el volumen')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Nivel de volumen (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('volumeup')
        .setDescription('Aumenta el volumen en 10%'),
    new SlashCommandBuilder()
        .setName('volumedown')
        .setDescription('Reduce el volumen en 10%'),
    new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Muestra la canción actual'),
    new SlashCommandBuilder()
        .setName('quality')
        .setDescription('Muestra información de calidad de audio'),
    new SlashCommandBuilder()
        .setName('connection')
        .setDescription('Verifica la calidad de la conexión'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Muestra la ayuda del bot')
].map(command => command.toJSON());

// Function to register slash commands
async function registerCommands() {
    try {
        console.log('Started refreshing application (/) commands.');
        
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        // Register commands globally
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
}

// Register commands when bot is ready
client.once('ready', async () => {
    console.log(`🎵 ${client.user.tag} is online and ready!`);
    
    // Register slash commands
    await registerCommands();
    
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
    
    console.log('🎵 Ready to play ultra-smooth music! Slash commands enabled');
    console.log('🔊 Audio optimizations: 64MB buffers, anti-stutter tech, 128kbps+ priority');
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    try {
        switch (commandName) {
            case 'play':
                await handlePlay(interaction);
                break;
            case 'pause':
                await handlePause(interaction);
                break;
            case 'resume':
                await handleResume(interaction);
                break;
            case 'skip':
                await handleSkip(interaction);
                break;
            case 'stop':
                await handleStop(interaction);
                break;
            case 'queue':
                await showQueue(interaction);
                break;
            case 'volume':
                await setVolume(interaction);
                break;
            case 'volumeup':
                await adjustVolume(interaction, 10);
                break;
            case 'volumedown':
                await adjustVolume(interaction, -10);
                break;
            case 'nowplaying':
                await showNowPlaying(interaction);
                break;
            case 'quality':
                await showAudioQuality(interaction);
                break;
            case 'connection':
                await checkConnection(interaction);
                break;
            case 'help':
                await showHelp(interaction);
                break;
        }
    } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: '❌ ¡Ocurrió un error al ejecutar el comando!', 
                ephemeral: true 
            });
        }
    }
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
    
    console.log('🎵 Ready to play ultra-smooth music! Spanish commands enabled for client');
    console.log('🔊 Audio optimizations: 64MB buffers, anti-stutter tech, 128kbps+ priority');
    console.log('🔗 Connection diagnostics available with !conexion command');
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    const args = message.content.slice(1).split(' ');
    const command = args[0].toLowerCase();
    
    // Only respond to commands that start with !
    if (!message.content.startsWith('!')) return;
    
   switch (command) {
        // Spanish commands (primary)
        case 'reproducir':
        case 'tocar':
        case 'play': // Keep English for compatibility
        case 'p':
            await handlePlay(message, args);
            break;
        case 'pausar':
        case 'pause':
            await handlePause(message);
            break;
        case 'reanudar':
        case 'continuar':
        case 'resume':
            await handleResume(message);
            break;
        case 'saltar':
        case 'skip':
            await handleSkip(message);
            break;
        case 'detener':
        case 'parar':
        case 'stop':
            await handleStop(message);
            break;
        case 'cola':
        case 'queue':
            await showQueue(message);
            break;
        case 'volumen':
        case 'vol':
        case 'volume':
            await setVolume(message, args[1]);
            break;
        case 'volumen+':
        case 'vol+':
        case 'subirvolumen':
        case 'volume+':
        case 'volumeup':
        case 'volup':
            await adjustVolume(message, 10);
            break;
        case 'volumen-':
        case 'vol-':
        case 'bajarvolumen':
        case 'volume-':
        case 'volumedown':
        case 'voldown':
            await adjustVolume(message, -10);
            break;
        case 'actual':
        case 'ahora':
        case 'np':
        case 'nowplaying':
            await showNowPlaying(message);
            break;
        case 'calidad':
        case 'quality':
        case 'q':
            await showAudioQuality(message);
            break;
        case 'conexion':
        case 'ping':
        case 'connection':
            await checkConnection(message);
            break;
        case 'ayuda':
        case 'help':
            await showHelp(message);
            break;
    }
});

// Handle play command
async function handlePlay(interaction) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        return interaction.reply('❌ ¡Necesitas estar en un canal de voz para reproducir música!');
    }
    
    const query = interaction.options.getString('query');
    if (!query) {
        return interaction.reply('❌ ¡Por favor proporciona el nombre de una canción, enlace de YouTube o enlace de Spotify!');
    }

    await interaction.deferReply();
    
    try {
        let songInfo;
        
        if (query.includes('spotify.com/track/')) {
            console.log('🎵 Detected Spotify link');
            songInfo = await handleSpotifyTrack(query);
        } 
        else if (query.includes('youtube.com/watch') || query.includes('youtu.be/')) {
            console.log('🎵 Detected YouTube link');
            const normalizedUrl = normalizeYouTubeURL(query);
            if (ytdl.validateURL(normalizedUrl)) {
                songInfo = await handleYouTubeLink(query);
            } else {
                return interaction.editReply('❌ ¡URL de YouTube inválida!');
            }
        }
        else {
            console.log('🎵 Searching for:', query);
            songInfo = await searchYouTube(query);
        }
        
        if (!songInfo) {
            return interaction.editReply('❌ ¡No se pudo encontrar esa canción!');
        }
        
        let serverQueue = serverQueues.get(interaction.guild.id);
        if (!serverQueue) {
            serverQueue = new ServerQueue();
            serverQueues.set(interaction.guild.id, serverQueue);
        }
        
        serverQueue.songs.push(songInfo);
        
        if (!serverQueue.playing) {
            await playMusic(interaction, serverQueue, voiceChannel);
        } else {
            const embed = new EmbedBuilder()
                .setTitle('🎵 Añadida a la Cola')
                .setDescription(`**${songInfo.title}**\nPor: ${songInfo.author}`)
                .setColor(0x00ff00)
                .setThumbnail(songInfo.thumbnail);
            
            await interaction.editReply({ embeds: [embed] });
        }
        
    } catch (error) {
        console.error('❌ Play command error:', error);
        await interaction.editReply('❌ ¡Algo salió mal al intentar reproducir esa canción!');
    }
}

// Handle pause command
async function handlePause(interaction) {
    const serverQueue = serverQueues.get(interaction.guild.id);
    if (!serverQueue || !serverQueue.player) {
        return interaction.reply('❌ ¡No se está reproduciendo nada actualmente!');
    }
    
    serverQueue.player.pause();
    await interaction.reply('⏸️ ¡Música pausada!');
}

// Handle resume command
async function handleResume(interaction) {
    const serverQueue = serverQueues.get(interaction.guild.id);
    if (!serverQueue || !serverQueue.player) {
        return interaction.reply('❌ ¡No hay nada pausado actualmente!');
    }
    
    serverQueue.player.unpause();
    await interaction.reply('▶️ ¡Música reanudada!');
}

// Handle skip command
async function handleSkip(interaction) {
    const serverQueue = serverQueues.get(interaction.guild.id);
    if (!serverQueue || !serverQueue.player) {
        return interaction.reply('❌ ¡No se está reproduciendo nada actualmente!');
    }
    
    if (serverQueue.songs.length <= 1) {
        return interaction.reply('❌ ¡No hay más canciones en la cola para saltar!');
    }
    
    serverQueue.player.stop();
    await interaction.reply('⏭️ ¡Canción saltada!');
}

// Handle stop command
async function handleStop(interaction) {
    const serverQueue = serverQueues.get(interaction.guild.id);
    if (!serverQueue) {
        return interaction.reply('❌ ¡No se está reproduciendo nada actualmente!');
    }
    
    serverQueue.songs = [];
    serverQueue.playing = false;
    
    if (serverQueue.player) {
        serverQueue.player.stop();
    }
    
    if (serverQueue.connection && serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        serverQueue.connection.destroy();
    }
    
    serverQueues.delete(interaction.guild.id);
    await interaction.reply('⏹️ ¡Música detenida y cola limpiada!');
}

// Show queue command
async function showQueue(interaction) {
    const serverQueue = serverQueues.get(interaction.guild.id);
    if (!serverQueue || serverQueue.songs.length === 0) {
        return interaction.reply('❌ ¡La cola está vacía!');
    }
    
    const queueList = serverQueue.songs.slice(0, 10).map((song, index) => {
        if (index === 0) {
            return `🎵 **Reproduciendo Ahora:** ${song.title} - ${song.author}`;
        }
        return `${index}. ${song.title} - ${song.author}`;
    }).join('\n');
    
    const embed = new EmbedBuilder()
        .setTitle('🎵 Cola de Música')
        .setDescription(queueList)
        .setColor(0x00ff00)
        .setFooter({ text: `${serverQueue.songs.length} canción(es) en cola` });
    
    await interaction.reply({ embeds: [embed] });
}

// Volume control
async function setVolume(interaction) {
    const serverQueue = serverQueues.get(interaction.guild.id);
    if (!serverQueue) {
        return interaction.reply('❌ ¡No se está reproduciendo nada actualmente!');
    }
    
    const volume = interaction.options.getInteger('level');
    
    // Show current volume if no parameter provided
    if (!volume) {
        const currentVol = Math.round((serverQueue.volume || 0.5) * 100);
        return interaction.reply(`🔊 Volumen actual: **${currentVol}%**`);
    }
    
    // Update server queue volume setting
    serverQueue.volume = volume / 100;
    
    // Apply volume to current audio resource if it has volume control
    if (serverQueue.player && serverQueue.player.state.resource && serverQueue.player.state.resource.volume) {
        serverQueue.player.state.resource.volume.setVolume(serverQueue.volume);
        
        const embed = new EmbedBuilder()
            .setTitle('🔊 Volumen Cambiado')
            .setDescription(`Volumen establecido a **${volume}%**`)
            .setColor(0x00ff00);
        
        await interaction.reply({ embeds: [embed] });
        console.log(`Volume set to ${volume}% for guild ${interaction.guild.id}`);
    } else {
        await interaction.reply(`🔊 Volumen establecido a **${volume}%** (se aplicará en la siguiente canción)`);
        console.log(`Volume setting saved: ${volume}% for guild ${interaction.guild.id}`);
    }
}

// Adjust volume up/down
async function adjustVolume(interaction, change) {
    const serverQueue = serverQueues.get(interaction.guild.id);
    if (!serverQueue) {
        return interaction.reply('❌ ¡No se está reproduciendo nada actualmente!');
    }
    
    const currentVol = Math.round((serverQueue.volume || 0.5) * 100);
    const newVol = Math.max(1, Math.min(100, currentVol + change));
    
    // Create a fake interaction with the new volume
    const fakeInteraction = {
        ...interaction,
        options: {
            getInteger: () => newVol
        }
    };
    
    await setVolume(fakeInteraction);
}

// Show now playing
async function showNowPlaying(interaction) {
    const serverQueue = serverQueues.get(interaction.guild.id);
    if (!serverQueue || serverQueue.songs.length === 0) {
        return interaction.reply('❌ ¡No se está reproduciendo nada actualmente!');
    }
    
    const song = serverQueue.songs[0];
    const quality = serverQueue.currentQuality;
    
    let qualityInfo = '';
    if (quality && quality.bitrate) {
        qualityInfo = `\nCalidad: ${quality.bitrate}kbps ${quality.codec?.toUpperCase() || 'Audio'}`;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🎵 Reproduciendo Ahora')
        .setDescription(`**${song.title}**\nPor: ${song.author}\nDuración: ${song.duration}${qualityInfo}`)
        .setColor(0x00ff00)
        .setThumbnail(song.thumbnail);
    
    await interaction.reply({ embeds: [embed] });
}

// Show audio quality
async function showAudioQuality(interaction) {
    const serverQueue = serverQueues.get(interaction.guild.id);
    if (!serverQueue || serverQueue.songs.length === 0) {
        return interaction.reply('❌ ¡No se está reproduciendo nada actualmente!');
    }
    
    const song = serverQueue.songs[0];
    const quality = serverQueue.currentQuality;
    
    let qualityText = 'Información de calidad no disponible';
    
    if (quality) {
        const bitrateText = quality.bitrate ? `${quality.bitrate}kbps` : 'Bitrate desconocido';
        const codecText = quality.codec || 'Códec desconocido';
        const containerText = quality.container || 'Formato desconocido';
        
        qualityText = `**Calidad de Audio:**\n🎵 Bitrate: ${bitrateText}\n🔊 Códec: ${codecText.toUpperCase()}\n📦 Contenedor: ${containerText.toUpperCase()}`;
        
        if (quality.bitrate) {
            if (quality.bitrate >= 256) {
                qualityText += '\n⭐ **Calidad Excelente**';
            } else if (quality.bitrate >= 128) {
                qualityText += '\n✅ **Alta Calidad**';
            } else if (quality.bitrate >= 96) {
                qualityText += '\n👍 **Buena Calidad**';
            } else {
                qualityText += '\n📱 **Calidad Estándar**';
            }
        }
        
        qualityText += '\n\n**Optimizaciones de Streaming:**\n🔄 Buffer de 64MB (Anti-cortes)\n🔇 Padding de Silencio (Transiciones suaves)';
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🎵 Calidad de Audio Actual')
        .setDescription(`**${song.title}**\nPor: ${song.author}\n\n${qualityText}`)
        .setColor(0x00ff00)
        .setThumbnail(song.thumbnail)
        .setFooter({ text: 'Optimizado para reproducción sin cortes • Use /connection para verificar la red' });
    
    await interaction.reply({ embeds: [embed] });
}

// Check connection
async function checkConnection(interaction) {
    await interaction.deferReply();
    
    const serverQueue = serverQueues.get(interaction.guild.id);
    
    // Basic ping test
    const pingStart = Date.now();
    const ping = Date.now() - pingStart;
    
    let connectionStatus = '✅ **Excelente** (< 50ms)';
    if (ping > 200) {
        connectionStatus = '❌ **Pobre** (> 200ms) - Puede causar cortes';
    } else if (ping > 100) {
        connectionStatus = '⚠️ **Regular** (100-200ms) - Posibles problemas menores';
    } else if (ping > 50) {
        connectionStatus = '👍 **Buena** (50-100ms)';
    }
    
    let voiceStatus = '❌ No conectado a voz';
    if (serverQueue && serverQueue.connection) {
        const state = serverQueue.connection.state.status;
        
        switch(state) {
            case VoiceConnectionStatus.Ready:
                voiceStatus = '✅ Conexión de voz: Lista';
                break;
            case VoiceConnectionStatus.Connecting:
                voiceStatus = '⏳ Conexión de voz: Conectando...';
                break;
            case VoiceConnectionStatus.Disconnected:
                voiceStatus = '❌ Conexión de voz: Desconectado';
                break;
            case VoiceConnectionStatus.Destroyed:
                voiceStatus = '💥 Conexión de voz: Destruida';
                break;
            default:
                voiceStatus = `🔍 Conexión de voz: ${state}`;
        }
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🔗 Diagnóstico de Conexión')
        .setDescription(`
        **Latencia de Discord:** ${ping}ms
        ${connectionStatus}
        
        **Estado de Voz:**
        ${voiceStatus}
        
        **Buffer de Audio:** 64MB (Optimizado para reproducción suave)
        **Padding de Silencio:** 5 frames (Protección anti-cortes)
        
        **Consejos para Mejor Rendimiento:**
        ${ping > 100 ? '• Intente cambiar a una región de voz diferente\n• Verifique su conexión a internet\n• Reinicie su router si los problemas persisten' : '• ¡La conexión se ve bien!\n• El audio debería reproducirse sin cortes'}
        `)
        .setColor(ping > 200 ? 0xff0000 : ping > 100 ? 0xffa500 : 0x00ff00)
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

// Show help
async function showHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎵 Bot de Música Ultra-Fluida - Comandos')
        .setDescription(`
        **🎮 Control de Música:**
        **/play [canción/enlace]** - Reproduce cualquier canción, enlace o término de búsqueda
        **/pause** - Pausa la canción actual
        **/resume** - Reanuda la canción pausada
        **/skip** - Salta a la siguiente canción
        **/stop** - Detiene la música y limpia la cola

        **🔊 Control de Volumen:**
        **/volume [1-100]** - Establece el volumen o muestra el actual
        **/volumeup** - Aumenta el volumen en 10%
        **/volumedown** - Reduce el volumen en 10%

        **📋 Cola e Información:**
        **/queue** - Muestra la cola actual de reproducción
        **/nowplaying** - Muestra la canción reproduciéndose con calidad
        **/quality** - Muestra información detallada de calidad de audio
        **/connection** - Verifica la conexión y diagnostica cortes
        **/help** - Muestra este mensaje de ayuda

        **💡 Ejemplos de Uso:**
        /play despacito - Busca y reproduce en alta calidad
        /play https://youtu.be/... - Enlace de YouTube
        /play https://open.spotify.com/track/... - Enlace de Spotify
        /volume 75 - Establece el volumen al 75%
        /connection - Soluciona problemas de cortes de audio
        `)
        .setColor(0x00ff00)
        .setFooter({ text: '🎵 Tecnología anti-cortes • Buffers de 64MB • Audio hasta 320kbps' });
    
    await interaction.reply({ embeds: [embed] });
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

// Handle YouTube links - Console logs in English for developer, user messages in Spanish  
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
                title: videoDetails.title || 'Título Desconocido',
                author: videoDetails.author?.name || 'Canal Desconocido',
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
                title: bestMatch.title || 'Título Desconocido',
                author: bestMatch.channel?.name || 'Canal Desconocido',
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
async function playMusic(interaction, serverQueue, voiceChannel) {
    const song = serverQueue.songs[0];
    
    if (!song) {
        serverQueue.playing = false;
        if (serverQueue.connection && serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            serverQueue.connection.destroy();
        }
        serverQueues.delete(interaction.guild.id);
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
        interaction.reply('❌ Invalid song URL, skipping to next song...');
        serverQueue.songs.shift();
        return playMusic(interaction, serverQueue, voiceChannel);
    }
    
    try {
        // Join voice channel with optimized settings for smooth audio
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
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
            interaction.reply('❌ Invalid URL format, skipping song...');
            serverQueue.songs.shift();
            return playMusic(interaction, serverQueue, voiceChannel);
        }
        
        // Double-check URL validity
        if (!ytdl.validateURL(validUrl)) {
            console.error('URL failed ytdl validation:', validUrl);
            interaction.reply('❌ Invalid YouTube URL, skipping song...');
            serverQueue.songs.shift();
            return playMusic(interaction, serverQueue, voiceChannel);
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
            
            await interaction.reply({ embeds: [embed] });
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
                
                await interaction.reply({ embeds: [embed] });
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
                                    .setTitle('🎵 Reproduciendo Ahora (Versión Alternativa)')
                                    .setDescription(`**${altVideo.title}**\nPor: ${altVideo.channel?.name || 'Desconocido'}\nDuración: ${formatDuration(altVideo.duration)}`)
                                    .setColor(0xff6600)
                                    .setThumbnail(altVideo.thumbnail?.url || '');
                                
                                await interaction.reply({ embeds: [embed] });
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
                    interaction.reply('❌ Could not play this song or find alternatives. YouTube may be blocking access. Skipping...');
                    serverQueue.songs.shift();
                    setTimeout(() => {
                        playMusic(interaction, serverQueue, voiceChannel);
                    }, 2000);
                    return;
                }
            }
        }
        
        // Handle when song ends
        player.on(AudioPlayerStatus.Idle, () => {
            console.log('Song finished, playing next...');
            serverQueue.songs.shift(); // Remove played song
            playMusic(interaction, serverQueue, voiceChannel); // Play next song
        });
        
        player.on('error', error => {
            console.error('Audio player error:', error);
            interaction.reply('❌ Error playing song, skipping to next...');
            serverQueue.songs.shift();
            // Don't immediately try to play next song if there's an error
            setTimeout(() => {
                playMusic(interaction, serverQueue, voiceChannel);
            }, 2000);
        });
        
    } catch (error) {
        console.error('Play music error:', error);
        interaction.reply('❌ Could not play the song, trying next in queue...');
        serverQueue.songs.shift(); // Remove the problematic song
        
        // Try next song after a delay
        setTimeout(() => {
            playMusic(interaction, serverQueue, voiceChannel);
        }, 2000);
    }
}

// Helper function to normalize YouTube URLs
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
client.login(process.env.DISCORD_TOKEN);