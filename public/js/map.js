function initYandexMap(){
    ymaps.ready(()=>{
        const map = new ymaps.Map("map",{center:[43.25,76.95],zoom:12});
        const input = document.getElementById("clientAddr");
        if(input){
            const suggestView = new ymaps.SuggestView(input);
        }
    });
}