// Homebridge owns persistence and its restart prompt for staged configuration.
export class NativeSave {
  constructor(homebridge, read) {
    this.homebridge = homebridge; this.read = read;
    this.owners = new Set(); this.generation = 0; this.pending = Promise.resolve();
  }
  invalidate(owner) {
    this.owners.add(owner); this.generation++;
    this.homebridge.disableSaveButton();
  }
  stage(owner, prepare) {
    this.invalidate(owner);
    const generation = this.generation;
    const operation = this.pending.then(async () => {
      if (generation !== this.generation) return;
      if (this.owners.size > 1) throw new Error('Save or discard your other edits before saving this section.');
      const result = await prepare();
      if (generation !== this.generation) return;
      const current = await this.read();
      if (current.revision !== result.revision) throw new Error('Configuration changed elsewhere. Discard your edits to load the latest settings.');
      await this.homebridge.updatePluginConfig(result.restartRequired ? result.blocks : current.blocks);
      if (generation !== this.generation) return;
      if (result.restartRequired) this.homebridge.enableSaveButton();
      return result;
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
  clear(owner) {
    this.owners.delete(owner); this.generation++; this.homebridge.disableSaveButton();
    const operation = this.pending.then(async () => {
      const current = await this.read();
      await this.homebridge.updatePluginConfig(current.blocks);
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
}
