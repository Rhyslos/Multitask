
// Dom selection functions
export function locate(type, identifier, parent = document){
    switch(type){
        case 'id':
            return document.getElementById(identifier);
        case 'class':
            return parent.getElementsByClassName(identifier)[0];
        case 'tag':
            return parent.getElementsByTagName(identifier)[0];
        default:
            return null;
    }
}

export function locateAll(type, identifier, parent = document){
    switch(type){
        case 'class':
            return parent.getElementsByClassName(identifier);
        case 'tag':
            return parent.getElementsByTagName(identifier);
        default:
            return[];
    }
}