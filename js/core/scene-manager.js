class SceneManager {
  constructor() {
    this.scenes = {
      mainMenu: null,
      stage1: null,
    };
    this.current = null;
  }

  switchTo(scene) {
    // Exit current one
    if (this.current) this.current.exit();

    let alias = scene;

    // Switch by scene number
    if (typeof scene === 'number') alias = Object.values(this.scenes)[scene];

    // Switch by scene string
    if (typeof scene === 'string') alias = this.scenes[scene];

    // Initialize new scene
    alias.init();

    // Make it the current one
    this.current = alias;
  }

  nextScene() {this.navigateScene('next')}

  previousScene() {this.navigateScene('previous')}

  navigateScene(direction){
    const lastScene = Object.keys(this.scenes).length - 1;
    for (let index = 0; index < lastScene; index++) {
      if (this.current === Object.values(this.scenes)[index]) {
        if (direction === 'next') {
          index++; // Move to next one
          if (index > lastScene) index = 0; // Wrap around if necessary
        } else {
          index--; // Move to previous one
          if (index < 0) index = lastScene; // Wrap around if necessary
        }
        this.switchTo(index); // Make the switch
        return;
      };
    }
  }

  updateCurrent() {if (this.current) this.current.update()}

  renderCurrent() {if (this.current) this.current.render()}
}

export default SceneManager;
