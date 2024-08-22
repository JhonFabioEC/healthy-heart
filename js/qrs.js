let chart;
let chartData = [];
let currentIndex = 0;
let interval;
let segmentSize;
let samplingFrequency;
let totalSamples;
let numSegments;
let totalTime;
let currentSegment = 1;
let isPlaying = false;
let filename;

$(document).ready(function () {
    initializeEventListeners();
    initializeFormValidation();
});

function initializeEventListeners() {
    $(".toggle-btn").click(() => $("#sidebar").toggleClass("expand"));
    $("#form_upload_files").submit(handleFileUpload);
}

function initializeFormValidation() {
    $.validator.addMethod("filesEqual", function (value, element, params) {
        function getFileNameWithoutExtension(fileInput) {
            let fileName = $(fileInput).val().split("\\").pop().split(".")[0];
            return fileName;
        }

        let heaFileName = getFileNameWithoutExtension(params[0]);
        let datFileName = getFileNameWithoutExtension(params[1]);
        let atrFileName = getFileNameWithoutExtension(params[2]);

        return heaFileName === datFileName && heaFileName === atrFileName;
    });

    $("#form_upload_files").validate({
        rs: {
            heaFile: { required: true },
            datFile: { required: true },
            atrFile: { required: true },
        },
        messages: {
            heaFile: { required: "Por favor cargue un registro", filesEqual: "Los archivos deben tener el mismo nombre" },
            datFile: { required: "Por favor cargue un registro" },
            atrFile: { required: "Por favor cargue un registro" },
        },
        highlight: (element) => $(element).parents(".col-sm-10").toggleClass("has-error has-success"),
        unhighlight: (element) => $(element).parents(".col-sm-10").toggleClass("has-error has-success"),
    });
}

async function handleFileUpload(e) {
    e.preventDefault();

    toggleLoadingState("#btn_upload", true, "Cargando...", null);
    disableButton(".btn", true);
    disableButton(".form-control", true);

    const formData = new FormData(this);
    appendFilesToFormData(formData);

    var isDisabled = false;

    try {
        const response = await uploadFiles(formData);
        filename = response.filename;
        const data = await fetchECGData(filename[0]);

        setupChartData(data);
        cloneTemplate();
        initializeChart();
        setupControlButtons();
        showButton("#btn_clean", true);
        $("#form_qrs").submit(handleQRS);
        isDisabled = true;

        scrollToBottom();
    } catch (error) {
        console.error("Error al subir archivos: ", error);
        isDisabled = false;
    } finally {
        disableButton(".btn", false);
        disableButton(".form-control", isDisabled);
        disableButton("#btn_upload", isDisabled);
        toggleLoadingState("#btn_upload", false, "Cargar", "fa-upload");
    }
}

async function handleQRS(e) {
    e.preventDefault();

    resetForm();
    toggleLoadingState("#btn_qrs", true, "Obteniendo...", null);
    disableButton(".btn", true);

    const data = await fetchQRSData(filename[0]);
    const qrs = data.qrs;

    setupDownloadLinks('#btn_download_qrs', qrs);
    scrollToBottom();
    toggleLoadingState("#btn_qrs", false, "Obtener QRS", "fa-heart-pulse");
    disableButton(".btn", false);
    disableButton("#btn_upload", true);
    disableButton("#btn_qrs", true);
    showButton(".download", true);
}

function appendFilesToFormData(formData) {
    formData.append("heaFile", $("#heaFile")[0].files[0]);
    formData.append("datFile", $("#datFile")[0].files[0]);
    formData.append("atrFile", $("#atrFile")[0].files[0]);
}

async function uploadFiles(formData) {
    return await $.ajax({
        url: "http://127.0.0.1:5003/api/upload",
        type: "POST",
        data: formData,
        contentType: false,
        processData: false,
    });
}

async function fetchECGData(filename) {
    const response = await fetch(`http://127.0.0.1:5003/api/ecg/${filename}`);
    return await response.json();
}

async function fetchQRSData(filename) {
    const response = await fetch(`http://127.0.0.1:5003/api/qrs/${filename}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json"
        }
    });
    return await response.json();
}

function setupChartData(data) {
    samplingFrequency = data.sampling_frequency;
    segmentSize = Math.floor(samplingFrequency);
    totalSamples = data.total_samples;
    chartData = data.data;
    numSegments = data.num_segments;
    totalTime = totalSamples / samplingFrequency;
}

function cloneTemplate() {
    var template = $('#template_graph_area').prop('content');
    var clone = $(template).find('#form_qrs').clone();
    $(".graph-area").append(clone);
}

function setupDownloadLinks(id, value) {
    const path = '../api/files/';
    $(id).attr('data-path', `${path}${value}`);

    $(id).on('click', function () {
        var filePath = $(this).data('path');
        var a = $('<a target="_blank" rel="noopener noreferrer"></a>').attr({
            href: filePath,
            download: filePath.split('/').pop()
        }).appendTo('body');
        a[0].click();
        a.remove();
    });
}

function setupControlButtons() {
    $("#btn_backward").on("click", backward);
    $("#btn_play").on("click", togglePlayPause);
    $("#btn_forward").on("click", forward);
    $("#btn_clean").on("click", clean);
}

function initializeChart() {
    setTimeout(() => {
        renderChart(chartData.slice(0, 1000));
        updateProgress();
    }, 0);
}

function renderChart(data) {
    const labels = data.length;
    const chartOptions = {
        fullWidth: true,
        chartPadding: { right: 40 },
        axisX: {
            labelInterpolationFnc: function (value, index) {
                return labels[index];
            }
        }
    };

    chart = new Chartist.Line('.ct-chart', {
        series: [data]
    }, chartOptions);
}

function updateChart() {
    currentIndex += segmentSize;
    if (currentIndex >= chartData.length) {
        clearInterval(interval);
        currentIndex = chartData.length - segmentSize;
    }
    renderChart(chartData.slice(currentIndex, currentIndex + 1000));
    updateProgress();
}

function togglePlayPause() {
    isPlaying = !isPlaying;
    if (isPlaying) {
        interval = setInterval(updateChart, 1000);
        $("#btn_play").html(`<i class="fa-solid fa-pause"></i>`);
    } else {
        clearInterval(interval);
        $("#btn_play").html(`<i class="fa-solid fa-play"></i>`);
    }
}

function forward() {
    isPlaying = false;
    clearInterval(interval);
    $("#btn_play").html(`<i class="fa-solid fa-play"></i>`);
    currentIndex += segmentSize;
    if (currentIndex >= chartData.length) {
        currentIndex = chartData.length - segmentSize;
    }
    renderChart(chartData.slice(currentIndex, currentIndex + 1000));
    updateProgress();
}

function backward() {
    isPlaying = false;
    clearInterval(interval);
    $("#btn_play").html(`<i class="fa-solid fa-play"></i>`);
    currentIndex -= segmentSize;
    if (currentIndex < 0) {
        currentIndex = 0;
    }
    renderChart(chartData.slice(currentIndex, currentIndex + 1000));
    updateProgress();
}

function updateProgress() {
    const progress = (currentIndex / totalSamples) * 100;
    $('#progress_bar').css('width', progress + '%');
    $('#progress_bar').attr('aria-valuenow', progress);

    const currentTime = currentIndex / samplingFrequency;
    $("#progress_time").text(`${formatTime(currentTime)}/${formatTime(totalTime)}`);
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function scrollToBottom() {
    const container = $('.container-content');
    container.scrollTop(container[0].scrollHeight);
}

function disableButton(selector, isDisabled) {
    if (isDisabled) {
        $(selector).attr("disabled", "disabled");
    } else {
        $(selector).removeAttr("disabled");
    }
}

function showButton(selector, isDisabled) {
    if (isDisabled) {
        $(selector).removeClass("d-none");
    } else {
        $(selector).addClass("d-none");
    }
}

function toggleLoadingState(id, isLoading, text, icon) {
    const btn = $(id);
    if (isLoading) {
        btn.html(`<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${text}`);
    } else {
        btn.html(`<i class="fa-solid ${icon}"></i> ${text}`);
    }
}

function clean() {
    $(".graph-area").empty();
    $("#form_upload_files")[0].reset();
    disableButton(".btn", false);
    disableButton(".form-control", false);
    showButton("#btn_clean", false);

    resetForm();
    chartData = [];
}

function resetForm() {
    isPlaying = false;
    $("#btn_play").html(`<i class="fa-solid fa-play"></i>`);
    clearInterval(interval);
    chart;
    currentIndex = 0;
    interval;
    segmentSize;
    samplingFrequency;
    totalSamples;
    numSegments;
    totalTime;
    currentSegment = 1;
}